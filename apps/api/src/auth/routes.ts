import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, generateRandomToken, hashToken, DUMMY_ARGON2_HASH } from './crypto.js';
import { signAccessToken } from './jwt.js';
import { authenticateUser } from '../middleware/auth.js';

interface AuthPluginOptions {
  pool: pg.Pool;
}

// -----------------------------------------------------------------------------
// Database-Backed Per-Account Login Throttling (In addition to per-IP rate limiting)
// State lives in PostgreSQL account_login_attempts table via SECURITY DEFINER functions.
// -----------------------------------------------------------------------------
export const ACCOUNT_MAX_FAILED_ATTEMPTS = 5;
export const ACCOUNT_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function recordFailedLogin(pool: pg.Pool, accountKey: string): Promise<{ isLocked: boolean; remainingLockMs?: number }> {
  const res = await pool.query<{
    out_failed_attempts: number;
    out_is_locked: boolean;
    out_remaining_seconds: number;
  }>(
    'SELECT * FROM auth_record_failed_login($1, $2, $3);',
    [accountKey, ACCOUNT_MAX_FAILED_ATTEMPTS, Math.floor(ACCOUNT_LOCKOUT_MS / 1000)]
  );
  const row = res.rows[0];
  return {
    isLocked: row?.out_is_locked || false,
    remainingLockMs: (row?.out_remaining_seconds || 0) * 1000
  };
}

export async function isAccountLocked(pool: pg.Pool, accountKey: string): Promise<{ isLocked: boolean; remainingLockMs?: number }> {
  const res = await pool.query<{
    out_is_locked: boolean;
    out_remaining_seconds: number;
  }>(
    'SELECT * FROM auth_is_account_locked($1);',
    [accountKey]
  );
  const row = res.rows[0];
  return {
    isLocked: row?.out_is_locked || false,
    remainingLockMs: (row?.out_remaining_seconds || 0) * 1000
  };
}

export async function clearAccountLockout(pool: pg.Pool, accountKey: string): Promise<void> {
  await pool.query('SELECT auth_clear_account_lockout($1);', [accountKey]);
}

export async function resetAccountThrottler(pool: pg.Pool): Promise<void> {
  await pool.query('SELECT auth_reset_account_throttler();');
}

// -----------------------------------------------------------------------------
// Refresh Token Grace Window (Tolerates concurrent / multi-tab refreshes)
// -----------------------------------------------------------------------------
export const REFRESH_GRACE_WINDOW_MS = 10_000; // 10 seconds grace window

export const authRoutes: FastifyPluginAsync<AuthPluginOptions> = async (fastify, { pool }) => {
  // 1. REGISTER (Closed for pilot - invite or admin provisioned only)
  fastify.post('/register', async (_req, reply: FastifyReply) => {
    return reply.status(403).send({
      error: 'Registration is invite-only for the pilot. Contact your gym administrator or claim a staff invitation.'
    });
  });

  // 2. LOGIN (Supports Phone or Email, Per-Tenant Password Overrides, and Multi-Tenant Selection)
  fastify.post<{
    Body: { phone?: string; email?: string; identifier?: string; password: string; gymSlug?: string; gymId?: string }
  }>('/login', {
    config: {
      rateLimit: {
        max: 300,
        timeWindow: '15 minutes'
      }
    }
  }, async (req, reply: FastifyReply) => {
    const rawIdentifier = req.body.identifier || req.body.phone || req.body.email || '';
    const identifier = rawIdentifier.trim();
    const { password } = req.body;
    if (!identifier || !password) {
      return reply.status(400).send({ error: 'Phone number or email address and password are required' });
    }

    // Check database account lockout
    const lockCheck = await isAccountLocked(pool, identifier);
    if (lockCheck.isLocked) {
      return reply.status(429).send({
        error: 'Too many failed login attempts for this account. Please try again in 5 minutes.'
      });
    }

    // Lookup user via SECURITY DEFINER function (matches by phone OR email)
    const userRes = await pool.query<{
      out_user_id: string;
      out_phone: string;
      out_email: string | null;
      out_password_hash: string;
      out_full_name: string;
      out_is_platform_admin: boolean;
    }>('SELECT * FROM auth_lookup_user_by_identifier($1);', [identifier]);

    const user = userRes.rows[0];

    // Dummy hash for unknown users: executes the exact same Argon2id cryptographic workload (~70ms)
    // to prevent timing side-channel user enumeration attacks.
    if (!user) {
      await verifyPassword(DUMMY_ARGON2_HASH, password);
      const lockRes = await recordFailedLogin(pool, identifier);
      if (lockRes.isLocked) {
        return reply.status(429).send({
          error: 'Too many failed login attempts for this account. Please try again in 5 minutes.'
        });
      }
      return reply.status(401).send({ error: 'Invalid phone number or password' });
    }

    // Read user's memberships with tenant information and gym-specific passwords
    const client = await pool.connect();
    let memRows: Array<{
      gym_id: string;
      gym_name: string;
      gym_slug: string;
      role: string;
      is_active: boolean;
      password_hash: string | null;
    }> = [];

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [user.out_user_id]);

      const memRes = await client.query<{
        gym_id: string;
        gym_name: string;
        gym_slug: string;
        role: string;
        is_active: boolean;
        password_hash: string | null;
      }>(`
        SELECT 
          ugm.gym_id,
          t.name AS gym_name,
          t.slug AS gym_slug,
          ugm.role,
          ugm.is_active,
          ugm.password_hash
        FROM user_gym_memberships ugm
        JOIN tenants t ON t.id = ugm.gym_id
        WHERE ugm.user_id = $1 AND ugm.is_active = true AND t.status = 'active';
      `, [user.out_user_id]);
      memRows = memRes.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Verify password across gyms (supporting gym-specific password overrides)
    const authenticatedMemberships: Array<{
      gym_id: string;
      gym_name: string;
      gym_slug: string;
      role: string;
      is_active: boolean;
    }> = [];

    const allMemberships: Array<{
      gym_id: string;
      gym_name: string;
      gym_slug: string;
      role: string;
      is_active: boolean;
      isUnlocked: boolean;
      hasCustomPassword: boolean;
    }> = [];

    let isPlatformAdminValid = false;
    if (user.out_is_platform_admin) {
      isPlatformAdminValid = await verifyPassword(user.out_password_hash, password);
    }

    for (const mem of memRows) {
      const effectiveHash = mem.password_hash || user.out_password_hash;
      const matches = await verifyPassword(effectiveHash, password);
      allMemberships.push({
        gym_id: mem.gym_id,
        gym_name: mem.gym_name,
        gym_slug: mem.gym_slug,
        role: mem.role,
        is_active: mem.is_active,
        isUnlocked: matches,
        hasCustomPassword: Boolean(mem.password_hash)
      });
      if (matches) {
        authenticatedMemberships.push({
          gym_id: mem.gym_id,
          gym_name: mem.gym_name,
          gym_slug: mem.gym_slug,
          role: mem.role,
          is_active: mem.is_active
        });
      }
    }

    const isGlobalValid = await verifyPassword(user.out_password_hash, password);

    // If global password matches and memberships didn't have custom overrides, unlock them
    if (isGlobalValid && authenticatedMemberships.length === 0 && memRows.length > 0) {
      for (const mem of memRows) {
        if (!mem.password_hash) {
          authenticatedMemberships.push({
            gym_id: mem.gym_id,
            gym_name: mem.gym_name,
            gym_slug: mem.gym_slug,
            role: mem.role,
            is_active: mem.is_active
          });
        }
      }
    }

    const isUserValid = isPlatformAdminValid || authenticatedMemberships.length > 0 || isGlobalValid;

    if (!isUserValid) {
      const lockRes = await recordFailedLogin(pool, identifier);
      if (lockRes.isLocked) {
        return reply.status(429).send({
          error: 'Too many failed login attempts for this account. Please try again in 5 minutes.'
        });
      }
      return reply.status(401).send({ error: 'Invalid phone number or password' });
    }

    // Success -> Clear failed login state in database
    await clearAccountLockout(pool, identifier);

    // Issue refresh token
    const clientRefresh = await pool.connect();
    let refreshTokenSecret: string;
    try {
      await clientRefresh.query('BEGIN');
      await clientRefresh.query("SELECT set_config('app.user_id', $1, true);", [user.out_user_id]);

      refreshTokenSecret = generateRandomToken(32);
      const tokenHash = hashToken(refreshTokenSecret);
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const targetGymId = authenticatedMemberships[0]?.gym_id || (user.out_is_platform_admin ? null : (memRows[0]?.gym_id || null));

      await clientRefresh.query(`
        INSERT INTO refresh_tokens (gym_id, user_id, token_hash, family_id, expires_at)
        VALUES ($1, $2, $3, $4, $5);
      `, [targetGymId, user.out_user_id, tokenHash, familyId, expiresAt]);

      await clientRefresh.query('COMMIT');
    } catch (err) {
      await clientRefresh.query('ROLLBACK');
      throw err;
    } finally {
      clientRefresh.release();
    }

    // Set HttpOnly SameSite=Strict cookie
    const cookiePayload = `${user.out_user_id}.${refreshTokenSecret}`;
    reply.setCookie('refresh_token', cookiePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60
    });

    const accessToken = signAccessToken({
      userId: user.out_user_id,
      fullName: user.out_full_name,
      isPlatformAdmin: user.out_is_platform_admin
    });

    return reply.send({
      accessToken,
      user: {
        id: user.out_user_id,
        fullName: user.out_full_name,
        phone: user.out_phone,
        email: user.out_email,
        isPlatformAdmin: user.out_is_platform_admin
      },
      memberships: authenticatedMemberships.length > 0 ? authenticatedMemberships : (user.out_is_platform_admin ? [] : memRows.map(m => ({ gym_id: m.gym_id, gym_name: m.gym_name, gym_slug: m.gym_slug, role: m.role, is_active: m.is_active }))),
      allMemberships: allMemberships.length > 0 ? allMemberships : memRows.map(m => ({
        gym_id: m.gym_id,
        gym_name: m.gym_name,
        gym_slug: m.gym_slug,
        role: m.role,
        is_active: m.is_active,
        isUnlocked: true,
        hasCustomPassword: false
      }))
    });
  });

  // 2b. SWITCH GYM TENANT / VERIFY GYM CREDENTIALS
  fastify.post<{
    Body: { gymId: string; password?: string }
  }>('/switch-gym', {
    preHandler: [authenticateUser]
  }, async (req, reply: FastifyReply) => {
    const { gymId, password } = req.body;
    const user = req.user!;

    if (!gymId) {
      return reply.status(400).send({ error: 'gymId is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [user.userId]);

      // If Super Admin, allow switching to any tenant directly
      if (user.isPlatformAdmin) {
        const tenantRes = await client.query<{ id: string; name: string; slug: string }>(
          'SELECT id, name, slug FROM tenants WHERE id = $1;',
          [gymId]
        );
        if (tenantRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'Gym tenant not found' });
        }
        await client.query('COMMIT');
        return reply.send({
          success: true,
          gym: {
            id: tenantRes.rows[0].id,
            name: tenantRes.rows[0].name,
            slug: tenantRes.rows[0].slug,
            role: 'platform_admin'
          }
        });
      }

      // Query membership in the target gym
      const memRes = await client.query<{
        gym_id: string;
        gym_name: string;
        gym_slug: string;
        role: string;
        is_active: boolean;
        password_hash: string | null;
      }>(`
        SELECT 
          ugm.gym_id,
          t.name AS gym_name,
          t.slug AS gym_slug,
          ugm.role,
          ugm.is_active,
          ugm.password_hash
        FROM user_gym_memberships ugm
        JOIN tenants t ON t.id = ugm.gym_id
        WHERE ugm.user_id = $1 AND ugm.gym_id = $2 AND ugm.is_active = true;
      `, [user.userId, gymId]);

      if (memRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(403).send({ error: 'You do not have an active membership in this gym tenant' });
      }

      const mem = memRes.rows[0];

      // If password is provided, verify it against the gym password or user password
      if (password) {
        let hashToTest = mem.password_hash;
        if (!hashToTest) {
          const userLookup = await client.query<{ out_password_hash: string }>(
            'SELECT out_password_hash FROM auth_lookup_user_by_id($1);',
            [user.userId]
          );
          hashToTest = userLookup.rows[0]?.out_password_hash || '';
        }
        const isValid = await verifyPassword(hashToTest, password);
        if (!isValid) {
          await client.query('ROLLBACK');
          return reply.status(401).send({ error: 'Incorrect password for this gym tenant' });
        }
      }

      await client.query('COMMIT');
      return reply.send({
        success: true,
        gym: {
          id: mem.gym_id,
          name: mem.gym_name,
          slug: mem.gym_slug,
          role: mem.role
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 3. REFRESH TOKEN ROTATION WITH REUSE DETECTION & CONCURRENCY GRACE WINDOW
  fastify.post('/refresh', async (req: FastifyRequest<{
    Body?: { refreshToken?: string }
  }>, reply: FastifyReply) => {
    const rawCookie = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!rawCookie || !rawCookie.includes('.')) {
      return reply.status(401).send({ error: 'Missing or malformed refresh token' });
    }

    const [userId, secret] = rawCookie.split('.');
    if (!userId || !secret) {
      return reply.status(401).send({ error: 'Invalid refresh token format' });
    }

    const tokenHash = hashToken(secret);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      // Set user context so RLS policy on refresh_tokens permits access
      await client.query("SELECT set_config('app.user_id', $1, true);", [userId]);

      const tokenRes = await client.query<{
        id: string;
        gym_id: string | null;
        user_id: string;
        family_id: string;
        is_revoked: boolean;
        revoked_at: Date | null;
        expires_at: Date;
      }>(`
        SELECT id, gym_id, user_id, family_id, is_revoked, revoked_at, expires_at
        FROM refresh_tokens
        WHERE user_id = $1 AND token_hash = $2
        FOR UPDATE;
      `, [userId, tokenHash]);

      const tokenRow = tokenRes.rows[0];
      if (!tokenRow) {
        await client.query('ROLLBACK');
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }

      // REUSE DETECTION CHECK:
      if (tokenRow.is_revoked) {
        const revokedTime = tokenRow.revoked_at ? new Date(tokenRow.revoked_at).getTime() : 0;
        const isWithinGraceWindow = revokedTime > 0 && (Date.now() - revokedTime) <= REFRESH_GRACE_WINDOW_MS;

        if (isWithinGraceWindow) {
          // Concurrent legitimate refresh! Return current active token in same family
          const activeRes = await client.query<{ id: string; expires_at: Date }>(`
            SELECT id, expires_at
            FROM refresh_tokens
            WHERE family_id = $1 AND is_revoked = false
            ORDER BY created_at DESC
            LIMIT 1;
          `, [tokenRow.family_id]);

          const activeToken = activeRes.rows[0];
          if (activeToken && new Date(activeToken.expires_at) > new Date()) {
            await client.query('COMMIT');
            const accessToken = signAccessToken({
              userId,
              fullName: 'Refreshed User'
            });
            return reply.send({ accessToken });
          }
        }

        // Out of grace window -> Actual reuse attack! Invalidate entire family
        await client.query(`
          UPDATE refresh_tokens
          SET is_revoked = true, revoked_at = NOW()
          WHERE family_id = $1;
        `, [tokenRow.family_id]);
        await client.query('COMMIT');

        reply.clearCookie('refresh_token', { path: '/' });
        return reply.status(401).send({
          error: 'Refresh token reuse detected. All sessions in this family have been invalidated.'
        });
      }

      // Expiration check
      if (new Date(tokenRow.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        reply.clearCookie('refresh_token', { path: '/' });
        return reply.status(401).send({ error: 'Refresh token has expired' });
      }

      // Revoke current token (rotation) and record revoked_at
      await client.query(`
        UPDATE refresh_tokens
        SET is_revoked = true, revoked_at = NOW()
        WHERE id = $1;
      `, [tokenRow.id]);

      // Generate new rotated token in the SAME family
      const newSecret = generateRandomToken(32);
      const newHash = hashToken(newSecret);
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await client.query(`
        INSERT INTO refresh_tokens (gym_id, user_id, token_hash, family_id, expires_at)
        VALUES ($1, $2, $3, $4, $5);
      `, [tokenRow.gym_id, userId, newHash, tokenRow.family_id, newExpiresAt]);

      await client.query('COMMIT');

      // Set rotated cookie
      const newCookiePayload = `${userId}.${newSecret}`;
      reply.setCookie('refresh_token', newCookiePayload, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      });

      const accessToken = signAccessToken({
        userId,
        fullName: 'Refreshed User'
      });

      return reply.send({ accessToken });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // 4. LOGOUT
  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawCookie = req.cookies?.refresh_token;
    if (rawCookie && rawCookie.includes('.')) {
      const [userId, secret] = rawCookie.split('.');
      const tokenHash = hashToken(secret);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.user_id', $1, true);", [userId]);
        await client.query(`
          UPDATE refresh_tokens
          SET is_revoked = true, revoked_at = NOW()
          WHERE user_id = $1 AND token_hash = $2;
        `, [userId, tokenHash]);
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }

    reply.clearCookie('refresh_token', { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // 5. CLAIM STAFF INVITATION
  fastify.post('/invites/claim', async (req: FastifyRequest<{
    Body: { inviteCode: string; phone: string; password: string; fullName: string }
  }>, reply: FastifyReply) => {
    const { inviteCode, phone, password, fullName } = req.body;
    if (!inviteCode || !phone || !password || !fullName) {
      return reply.status(400).send({ error: 'Missing required fields: inviteCode, phone, password, fullName' });
    }

    const tokenHash = hashToken(inviteCode);

    // 1. Check if user exists or register
    let userId: string;
    const existing = await pool.query<{ out_user_id: string; out_password_hash: string }>(
      'SELECT out_user_id, out_password_hash FROM auth_lookup_user_by_phone($1);',
      [phone]
    );

    if (existing.rows[0]) {
      const valid = await verifyPassword(existing.rows[0].out_password_hash, password);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid password for existing user account' });
      }
      userId = existing.rows[0].out_user_id;
    } else {
      const passwordHash = await hashPassword(password);
      const reg = await pool.query<{ auth_register_user: string }>(
        'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
        [phone, passwordHash, fullName]
      );
      userId = reg.rows[0].auth_register_user;
    }

    // 2. Claim invitation under transaction with app.user_id = userId
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [userId]);

      const claimRes = await client.query<{ out_gym_id: string; out_role: string }>(
        'SELECT * FROM claim_staff_invitation($1, $2);',
        [tokenHash, userId]
      );

      const claimed = claimRes.rows[0];

      // Issue refresh token
      const secret = generateRandomToken(32);
      const rfHash = hashToken(secret);
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await client.query(`
        INSERT INTO refresh_tokens (gym_id, user_id, token_hash, family_id, expires_at)
        VALUES ($1, $2, $3, $4, $5);
      `, [claimed.out_gym_id, userId, rfHash, familyId, expiresAt]);

      await client.query('COMMIT');

      reply.setCookie('refresh_token', `${userId}.${secret}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 24 * 60 * 60
      });

      const accessToken = signAccessToken({
        userId,
        fullName
      });

      return reply.send({
        message: 'Invitation claimed successfully',
        gymId: claimed.out_gym_id,
        role: claimed.out_role,
        accessToken
      });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const errorMsg = err instanceof Error ? err.message : 'Failed to claim invitation';
      return reply.status(400).send({ error: errorMsg });
    } finally {
      client.release();
    }
  });

  // 6. PASSWORD RESET REQUEST (No user enumeration protection)
  fastify.post('/password-reset/request', async (req: FastifyRequest<{
    Body: { phone: string }
  }>, reply: FastifyReply) => {
    const { phone } = req.body;
    if (!phone) {
      return reply.status(400).send({ error: 'Phone number is required' });
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'SELECT auth_request_password_reset($1, $2, $3);',
      [phone, tokenHash, expiresAt]
    );

    // Uniform response: Never leaks whether phone exists or not
    return reply.send({
      message: 'If an account exists for this phone number, a password reset instruction has been processed.',
      debugToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined
    });
  });

  // 7. PASSWORD RESET COMPLETE
  fastify.post('/password-reset/complete', async (req: FastifyRequest<{
    Body: { token: string; newPassword: string }
  }>, reply: FastifyReply) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return reply.status(400).send({ error: 'Token and newPassword are required' });
    }

    const tokenHash = hashToken(token);
    const newPasswordHash = await hashPassword(newPassword);

    const res = await pool.query<{ auth_complete_password_reset: boolean }>(
      'SELECT auth_complete_password_reset($1, $2) as auth_complete_password_reset;',
      [tokenHash, newPasswordHash]
    );

    const success = res.rows[0]?.auth_complete_password_reset;
    if (!success) {
      return reply.status(400).send({ error: 'Invalid or expired password reset token' });
    }

    return reply.send({ message: 'Password reset successfully. You may now login.' });
  });
};

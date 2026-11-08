import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool } from '@gym/db';
import type pg from 'pg';
import { resetAccountThrottler } from '../src/auth/routes.js';

describe('Auth & Session System', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const testPhone = `+91987${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testPassword = 'StrongPassword123!';
  let userId: string;
  let refreshTokenCookie: string;
  let accessToken: string;

  beforeAll(async () => {
    resetAccountThrottler();
    pool = createPool();
    app = buildApp(pool);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. registers a new user with Argon2id password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        phone: testPhone,
        password: testPassword,
        fullName: 'Test Owner'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBeDefined();
    userId = body.userId;
  });

  it('2. enforces per-account login throttling after 5 failed attempts', async () => {
    const attackPhone = `+91989${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Register account to target
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { phone: attackPhone, password: 'RealPassword123!', fullName: 'Target User' }
    });

    // 4 failed attempts should return 401
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { phone: attackPhone, password: 'BadPassword!' }
      });
      expect(res.statusCode).toBe(401);
    }

    // 5th failed attempt triggers 429 Account Lockout
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: attackPhone, password: 'BadPassword!' }
    });
    expect(lockRes.statusCode).toBe(429);
    expect(lockRes.json().error).toContain('Too many failed login attempts for this account');

    // 6th attempt even with correct password is still rejected with 429
    const lockedValidRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: attackPhone, password: 'RealPassword123!' }
    });
    expect(lockedValidRes.statusCode).toBe(429);
  });

  it('3. logs in with Argon2id verification and receives tokens + HttpOnly cookie', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        phone: testPhone,
        password: testPassword
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.id).toBe(userId);
    accessToken = body.accessToken;

    const cookies = loginRes.cookies;
    const rfCookie = cookies.find(c => c.name === 'refresh_token');
    expect(rfCookie).toBeDefined();
    expect(rfCookie?.httpOnly).toBe(true);
    expect(rfCookie?.sameSite).toBe('Strict');
    expect(rfCookie?.value).toContain(userId);
    refreshTokenCookie = rfCookie!.value;
  });

  it('4. rotates refresh token and tolerates near-simultaneous refreshes within grace window', async () => {
    // First legitimate refresh: rotates token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${refreshTokenCookie}` }
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.accessToken).toBeDefined();

    const newRfCookie = refreshRes.cookies.find(c => c.name === 'refresh_token');
    expect(newRfCookie).toBeDefined();
    expect(newRfCookie?.value).not.toBe(refreshTokenCookie);

    const oldSpentCookie = refreshTokenCookie;
    const newActiveCookie = newRfCookie!.value;

    // CONCURRENT REFRESH: Presenting old spent cookie within 10s grace window MUST succeed!
    const concurrentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${oldSpentCookie}` }
    });

    expect(concurrentRes.statusCode).toBe(200);
    expect(concurrentRes.json().accessToken).toBeDefined();

    // Now simulate token reuse outside the grace window by backdating revoked_at > 10 seconds ago
    // (Must run under app.user_id context to satisfy RLS)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [userId]);
      await client.query(`
        UPDATE refresh_tokens
        SET revoked_at = NOW() - INTERVAL '30 seconds'
        WHERE user_id = $1 AND is_revoked = true;
      `, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Presenting spent cookie outside grace window must trigger reuse detection and revoke family
    const reuseAttackRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${oldSpentCookie}` }
    });

    expect(reuseAttackRes.statusCode).toBe(401);
    expect(reuseAttackRes.json().error).toContain('reuse detected');

    // And now the previously active cookie must ALSO be invalidated
    const subsequentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${newActiveCookie}` }
    });
    expect(subsequentRes.statusCode).toBe(401);
  });

  it('5. password reset request returns uniform response without user enumeration', async () => {
    // Non-existent phone
    const nonExistentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { phone: '+910000000000' }
    });
    expect(nonExistentRes.statusCode).toBe(200);
    expect(nonExistentRes.json().message).toContain('If an account exists');

    // Existing phone
    const existingRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { phone: testPhone }
    });
    expect(existingRes.statusCode).toBe(200);
    expect(existingRes.json().message).toContain('If an account exists');
  });

  it('6. allows owner-initiated password reset for phone-only member', async () => {
    // Re-login to get fresh tokens
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: testPhone, password: testPassword }
    });
    const ownerToken = loginRes.json().accessToken;

    // Provision a gym
    const gymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Iron Palace', slug: `iron-palace-${Date.now()}` }
    });
    const gymId = gymRes.json().gymId;

    // Create member with phone
    const memberPhone = `+91777${Date.now().toString().slice(-7)}`;
    const memberRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { firstName: 'PhoneOnly', lastName: 'Member', phone: memberPhone }
    });
    const memberId = memberRes.json().member.id;

    // Owner generates reset link
    const resetGenRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members/${memberId}/reset-password`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(resetGenRes.statusCode).toBe(200);
    const resetBody = resetGenRes.json();
    expect(resetBody.resetToken).toBeDefined();
    expect(resetBody.resetUrl).toContain(resetBody.resetToken);

    // Complete password reset using the token
    const newMemberPass = 'MemberPass1234!';
    const compRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/complete',
      payload: {
        token: resetBody.resetToken,
        newPassword: newMemberPass
      }
    });
    expect(compRes.statusCode).toBe(200);
  });
});

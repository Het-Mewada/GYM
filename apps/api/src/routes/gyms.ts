import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { withTenantContext, members, eq, and, or, ilike, isNull, desc, sql } from '@gym/db';
import { authenticateUser, createRequireTenantMembership } from '../middleware/auth.js';
import { generateRandomToken, hashToken } from '../auth/crypto.js';

interface GymRoutesOptions {
  pool: pg.Pool;
}

export const gymRoutes: FastifyPluginAsync<GymRoutesOptions> = async (fastify, { pool }) => {
  const requireTenant = createRequireTenantMembership(pool);

  // 1. Provision new gym
  fastify.post<{
    Body: { name: string; slug: string; country?: string; timezone?: string; currency?: string; taxRateBasisPoints?: number };
  }>('/', { preHandler: [authenticateUser] }, async (req, reply) => {
    const user = req.user!;
    const { name, slug, country = 'IN', timezone = 'Asia/Kolkata', currency = 'INR', taxRateBasisPoints = 0 } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [user.userId]);

      const res = await client.query<{ provision_gym: string }>(
        'SELECT provision_gym($1, $2, $3, $4, $5, $6, $7) as provision_gym;',
        [user.userId, name, slug, country, timezone, currency, taxRateBasisPoints]
      );
      await client.query('COMMIT');

      const gymId = res.rows[0].provision_gym;
      return reply.status(201).send({ gymId, name, slug });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const dbErr = err as { code?: string; message?: string };
      if (dbErr.code === '23505') {
        return reply.status(409).send({ error: 'Gym slug already taken' });
      }
      return reply.status(400).send({ error: dbErr.message || 'Failed to provision gym' });
    } finally {
      client.release();
    }
  });

  // 2. List members in gym (with search query, status filter, and pagination)
  fastify.get<{
    Params: { gymId: string };
    Querystring: { q?: string; status?: string; limit?: string; offset?: string };
  }>('/:gymId/members', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const { q, status, limit: rawLimit, offset: rawOffset } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(rawOffset || '0', 10) || 0, 0);

    const { membersList, total } = await withTenantContext(pool, { gymId, userId }, async (db) => {
      const conditions = [eq(members.gymId, gymId), isNull(members.deletedAt)];

      if (status && status !== 'all') {
        conditions.push(eq(members.status, status));
      }

      if (q && q.trim()) {
        const searchTerm = `%${q.trim()}%`;
        conditions.push(
          or(
            ilike(members.firstName, searchTerm),
            ilike(members.lastName, searchTerm),
            ilike(members.phone, searchTerm),
            ilike(members.memberNumber, searchTerm),
            sql`(${members.firstName} || ' ' || COALESCE(${members.lastName}, '')) ILIKE ${searchTerm}`
          )!
        );
      }

      const rows = await db
        .select()
        .from(members)
        .where(and(...conditions))
        .orderBy(desc(members.createdAt))
        .limit(limit)
        .offset(offset);

      const countRes = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(members)
        .where(and(...conditions));

      return {
        membersList: rows,
        total: Number(countRes[0]?.count || 0)
      };
    });

    return reply.send({
      members: membersList,
      total,
      limit,
      offset
    });
  });

  // 3. Create member in gym
  fastify.post<{
    Params: { gymId: string };
    Body: {
      firstName: string;
      lastName?: string;
      phone: string;
      email?: string;
      gender?: string;
      dateOfBirth?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      gym_id?: string;
      gymId?: string;
    };
  }>('/:gymId/members', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const {
      firstName,
      lastName,
      phone,
      email,
      gender = 'unspecified',
      dateOfBirth,
      emergencyContactName,
      emergencyContactPhone
    } = req.body;

    if (!firstName || !firstName.trim() || !phone || !phone.trim()) {
      return reply.status(400).send({ error: 'firstName and phone are required' });
    }

    try {
      const created = await withTenantContext(pool, { gymId, userId }, async (db, client) => {
        // Generate monotonic member number
        const seqRes = await client.query<{ generate_next_member_number: string }>(
          'SELECT generate_next_member_number($1) as generate_next_member_number;',
          [gymId]
        );
        const memberNumber = seqRes.rows[0].generate_next_member_number;

        const rows = await db.insert(members).values({
          gymId,
          memberNumber,
          firstName: firstName.trim(),
          lastName: lastName?.trim() ? lastName.trim() : null,
          phone: phone.trim(),
          email: email?.trim() ? email.trim() : null,
          gender: gender || 'unspecified',
          dateOfBirth: dateOfBirth || null,
          emergencyContactName: emergencyContactName?.trim() ? emergencyContactName.trim() : null,
          emergencyContactPhone: emergencyContactPhone?.trim() ? emergencyContactPhone.trim() : null,
          status: 'active'
        }).returning();

        return rows[0];
      });

      return reply.status(201).send({ member: created });
    } catch (err: unknown) {
      const dbErr = err as { code?: string; constraint?: string; message?: string };
      if (dbErr.code === '23505') {
        if (dbErr.constraint?.includes('phone')) {
          return reply.status(409).send({ error: 'A member with this phone number already exists in this gym' });
        }
        return reply.status(409).send({ error: 'Member already exists with these details' });
      }
      return reply.status(400).send({ error: dbErr.message || 'Failed to create member' });
    }
  });

  // 4. Get member by ID (guards against cross-tenant lookup)
  fastify.get<{
    Params: { gymId: string; memberId: string };
  }>('/:gymId/members/:memberId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const { memberId } = req.params;

    const row = await withTenantContext(pool, { gymId, userId }, async (db) => {
      const rows = await db.select()
        .from(members)
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId)));
      return rows[0] || null;
    });

    if (!row) {
      return reply.status(404).send({ error: 'Member not found in this gym' });
    }

    return reply.send({ member: row });
  });

  // 5. Create Staff Invitation
  fastify.post<{
    Params: { gymId: string };
    Body?: { role?: string; gym_id?: string; gymId?: string };
  }>('/:gymId/staff/invites', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId, role: userRole } = req.tenantContext!;
    if (userRole !== 'owner') {
      return reply.status(403).send({ error: 'Only gym owners can create staff invitations' });
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const inviteRole = req.body?.role || 'staff';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await withTenantContext(pool, { gymId, userId }, async (_db, client) => {
      await client.query(`
        INSERT INTO staff_invitations (gym_id, token_hash, role, created_by_user_id, expires_at)
        VALUES ($1, $2, $3, $4, $5);
      `, [gymId, tokenHash, inviteRole, userId, expiresAt]);
    });

    return reply.status(201).send({
      inviteCode: rawToken,
      role: inviteRole,
      expiresAt: expiresAt.toISOString(),
      inviteUrl: `https://app.gymsaas.local/invites/${rawToken}`
    });
  });

  // 6. Owner-Initiated Staff Password Reset (Owner only, cannot reset another owner)
  fastify.post<{
    Params: { gymId: string; userId: string };
    Body?: { gym_id?: string; gymId?: string };
  }>('/:gymId/staff/:userId/reset-password', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId: callerId, role: userRole } = req.tenantContext!;
    const { userId: targetUserId } = req.params;

    if (userRole !== 'owner') {
      return reply.status(403).send({ error: 'Only gym owners can initiate staff password resets' });
    }

    if (callerId === targetUserId) {
      return reply.status(400).send({ error: 'Cannot initiate owner reset via staff reset procedure' });
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    try {
      const result = await withTenantContext(pool, { gymId, userId: callerId }, async (_db, client) => {
        const res = await client.query<{
          out_user_id: string;
          out_phone: string;
          out_full_name: string;
        }>(
          'SELECT * FROM auth_create_staff_password_reset($1, $2, $3, $4, $5);',
          [callerId, gymId, targetUserId, tokenHash, expiresAt]
        );
        const row = res.rows[0];
        if (!row) {
          return null;
        }

        return {
          userId: row.out_user_id,
          phone: row.out_phone,
          fullName: row.out_full_name,
          resetToken: rawToken,
          resetUrl: `https://app.gymsaas.local/reset-password?token=${rawToken}`,
          expiresAt: expiresAt.toISOString()
        };
      });

      return reply.status(200).send(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Owners cannot reset passwords of other owners')) {
        return reply.status(403).send({ error: 'Owners cannot reset passwords of other owners' });
      }
      if (errMsg.includes('Target staff member is not active in this gym') || errMsg.includes('Not found')) {
        return reply.status(404).send({ error: 'Staff member not found in this gym' });
      }
      if (errMsg.includes('Only gym owners can initiate staff password resets')) {
        return reply.status(403).send({ error: 'Only gym owners can initiate staff password resets' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to initiate staff password reset' });
    }
  });
};

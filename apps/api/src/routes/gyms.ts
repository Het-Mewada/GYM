import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { withTenantContext, members, eq, and } from '@gym/db';
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

  // 2. List members in gym
  fastify.get<{
    Params: { gymId: string };
  }>('/:gymId/members', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;

    const result = await withTenantContext(pool, { gymId, userId }, async (db) => {
      return await db.select().from(members).where(eq(members.gymId, gymId));
    });

    return reply.send({ members: result });
  });

  // 3. Create member in gym
  fastify.post<{
    Params: { gymId: string };
    Body: { firstName: string; lastName?: string; phone: string; email?: string; gym_id?: string; gymId?: string };
  }>('/:gymId/members', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const { firstName, lastName, phone, email } = req.body;

    if (!firstName || !phone) {
      return reply.status(400).send({ error: 'firstName and phone are required' });
    }

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
        firstName,
        lastName: lastName || null,
        phone,
        email: email || null,
        status: 'active'
      }).returning();

      return rows[0];
    });

    return reply.status(201).send({ member: created });
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
};

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { withTenantContext, members, membershipPlans, subscriptions, eq, and, or, ilike, isNull, desc, sql } from '@gym/db';
import { authenticateUser, createRequireTenantMembership } from '../middleware/auth.js';
import { generateRandomToken, hashToken, hashPassword } from '../auth/crypto.js';

interface GymRoutesOptions {
  pool: pg.Pool;
}

export const gymRoutes: FastifyPluginAsync<GymRoutesOptions> = async (fastify, { pool }) => {
  const requireTenant = createRequireTenantMembership(pool);

  // 1. Provision new gym (Self-provisioning or Platform Super Admin creating tenant with initial admin)
  fastify.post<{
    Body: {
      name: string;
      slug: string;
      country?: string;
      timezone?: string;
      currency?: string;
      taxRateBasisPoints?: number;
      adminPhone?: string;
      adminFullName?: string;
      adminPassword?: string;
      adminEmail?: string;
    };
  }>('/', { preHandler: [authenticateUser] }, async (req, reply) => {
    const caller = req.user!;
    const {
      name,
      slug,
      country = 'IN',
      timezone = 'Asia/Kolkata',
      currency = 'INR',
      taxRateBasisPoints = 1800,
      adminPhone,
      adminFullName,
      adminPassword,
      adminEmail
    } = req.body;

    if (!name || !name.trim() || !slug || !slug.trim()) {
      return reply.status(400).send({ error: 'Tenant name and slug are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [caller.userId]);

      let targetOwnerId = caller.userId;
      let createdAdminUser: { id: string; fullName: string; phone: string; email: string | null } | null = null;

      if (adminPhone) {
        if (!caller.isPlatformAdmin) {
          await client.query('ROLLBACK');
          return reply.status(403).send({ error: 'Forbidden: Only platform super administrators can provision tenants with an admin user' });
        }

        if (!adminFullName || !adminFullName.trim() || !adminPassword || !adminPassword.trim()) {
          await client.query('ROLLBACK');
          return reply.status(400).send({ error: 'adminFullName and adminPassword are required when creating a tenant with an admin user' });
        }

        const normalizedPhone = adminPhone.trim();
        let existingRes = await client.query<{ out_user_id: string; out_full_name: string }>(
          'SELECT out_user_id, out_full_name FROM auth_lookup_user_by_identifier($1);',
          [normalizedPhone]
        );

        if (existingRes.rows.length === 0 && adminEmail && adminEmail.trim()) {
          existingRes = await client.query<{ out_user_id: string; out_full_name: string }>(
            'SELECT out_user_id, out_full_name FROM auth_lookup_user_by_identifier($1);',
            [adminEmail.trim()]
          );
        }

        const passHash = await hashPassword(adminPassword);

        if (existingRes.rows.length > 0) {
          targetOwnerId = existingRes.rows[0].out_user_id;
          createdAdminUser = {
            id: targetOwnerId,
            fullName: existingRes.rows[0].out_full_name,
            phone: normalizedPhone,
            email: adminEmail?.trim() || null
          };
        } else {
          const regRes = await client.query<{ auth_register_user: string }>(
            'SELECT auth_register_user($1, $2, $3, $4) as auth_register_user;',
            [normalizedPhone, passHash, adminFullName.trim(), adminEmail?.trim() || null]
          );
          targetOwnerId = regRes.rows[0].auth_register_user;
          createdAdminUser = {
            id: targetOwnerId,
            fullName: adminFullName.trim(),
            phone: normalizedPhone,
            email: adminEmail?.trim() || null
          };
        }
      }

      const gymPasswordHash = (createdAdminUser && adminPassword) ? await hashPassword(adminPassword) : null;

      const res = await client.query<{ provision_gym: string }>(
        'SELECT provision_gym($1, $2, $3, $4, $5, $6, $7, $8) as provision_gym;',
        [targetOwnerId, name.trim(), slug.trim().toLowerCase(), country, timezone, currency, taxRateBasisPoints, gymPasswordHash]
      );

      const gymId = res.rows[0].provision_gym;

      // Automatically enroll initial owner/admin as member #1 in this gym's members directory
      if (createdAdminUser) {
        await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
        const seqRes = await client.query<{ generate_next_member_number: string }>(
          'SELECT generate_next_member_number($1) as generate_next_member_number;',
          [gymId]
        );
        const memberNum = seqRes.rows[0]?.generate_next_member_number || 'MEM-00001';

        const nameParts = createdAdminUser.fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || createdAdminUser.fullName.trim();
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

        await client.query(`
          INSERT INTO members (gym_id, member_number, first_name, last_name, phone, email, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'active')
          ON CONFLICT DO NOTHING;
        `, [gymId, memberNum, firstName, lastName, createdAdminUser.phone, createdAdminUser.email]);
      }

      await client.query('COMMIT');

      return reply.status(201).send({
        gymId,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        country,
        timezone,
        currency,
        adminUser: createdAdminUser || {
          id: caller.userId,
          fullName: caller.fullName,
          role: 'owner'
        }
      });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const dbErr = err as { code?: string; constraint?: string; message?: string };
      if (dbErr.code === '23505') {
        if (dbErr.constraint?.includes('slug')) {
          return reply.status(409).send({ error: 'Gym slug already taken' });
        }
        if (dbErr.constraint?.includes('phone')) {
          return reply.status(409).send({ error: 'A user with this phone number already exists' });
        }
        if (dbErr.constraint?.includes('email')) {
          return reply.status(409).send({ error: 'A user with this email address already exists' });
        }
        return reply.status(409).send({ error: `Unique constraint violation on ${dbErr.constraint || 'unknown'}` });
      }
      return reply.status(400).send({ error: dbErr.message || 'Failed to provision gym' });
    } finally {
      client.release();
    }
  });

  // 1b. List all tenants (Platform Super Admin gets all tenants; regular users get their memberships)
  fastify.get('/', { preHandler: [authenticateUser] }, async (req, reply) => {
    const user = req.user!;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [user.userId]);

      let resultRows;
      if (user.isPlatformAdmin) {
        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          default_country: string;
          timezone: string;
          currency: string;
          tax_rate_basis_points: number;
          created_at: string;
          admin_name: string | null;
          admin_phone: string | null;
          admin_email: string | null;
        }>('SELECT * FROM platform_list_all_tenants();');
        resultRows = res.rows;
      } else {
        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          role: string;
        }>('SELECT * FROM get_user_tenants($1);', [user.userId]);
        resultRows = res.rows;
      }

      await client.query('COMMIT');
      return reply.send({ tenants: resultRows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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
        // Pre-check for duplicate phone or email within this gym
        const existing = await client.query<{ phone: string; email: string | null }>(
          `SELECT phone, email FROM members 
           WHERE gym_id = $1 AND (phone = $2 OR (email IS NOT NULL AND lower(email) = lower($3)))
           LIMIT 1;`,
          [gymId, phone.trim(), email?.trim() || null]
        );

        if (existing.rows.length > 0) {
          const match = existing.rows[0];
          if (match.phone === phone.trim()) {
            const err = new Error('A member with this phone number already exists in this gym') as Error & { statusCode: number };
            err.statusCode = 409;
            throw err;
          }
          if (email?.trim() && match.email && match.email.toLowerCase() === email.trim().toLowerCase()) {
            const err = new Error('A member with this email already exists in this gym') as Error & { statusCode: number };
            err.statusCode = 409;
            throw err;
          }
        }

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
      const dbErr = (err && typeof err === 'object' && 'cause' in err && err.cause ? err.cause : err) as {
        code?: string;
        constraint?: string;
        message?: string;
        statusCode?: number;
      };
      if (dbErr.statusCode === 409) {
        return reply.status(409).send({ error: dbErr.message });
      }
      if (dbErr.code === '23505') {
        if (dbErr.constraint?.includes('phone')) {
          return reply.status(409).send({ error: 'A member with this phone number already exists in this gym' });
        }
        if (dbErr.constraint?.includes('email')) {
          return reply.status(409).send({ error: 'A member with this email already exists in this gym' });
        }
        return reply.status(409).send({ error: 'A member with these details already exists in this gym' });
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

  // 4b. Update member by ID (Owner only, strictly isolated to caller's gym)
  fastify.patch<{
    Params: { gymId: string; memberId: string };
    Body: {
      firstName?: string;
      lastName?: string | null;
      phone?: string;
      email?: string | null;
      gender?: string;
      dateOfBirth?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      status?: 'active' | 'inactive' | 'banned';
      gym_id?: string;
      gymId?: string;
    };
  }>('/:gymId/members/:memberId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId, role: userRole } = req.tenantContext!;

    if (userRole !== 'owner') {
      return reply.status(403).send({ error: 'Only gym owners can edit member details' });
    }

    const { memberId } = req.params;
    const {
      firstName,
      lastName,
      phone,
      email,
      gender,
      dateOfBirth,
      emergencyContactName,
      emergencyContactPhone,
      status
    } = req.body || {};

    if (firstName !== undefined && !firstName.trim()) {
      return reply.status(400).send({ error: 'firstName cannot be empty' });
    }

    if (phone !== undefined && !phone.trim()) {
      return reply.status(400).send({ error: 'phone cannot be empty' });
    }

    if (status !== undefined && !['active', 'inactive', 'banned'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status. Must be active, inactive, or banned' });
    }

    try {
      const updated = await withTenantContext(pool, { gymId, userId }, async (db, client) => {
        // Pre-check duplicate phone or email within this gym (excluding current member)
        if (phone || (email !== undefined && email !== null)) {
          const existing = await client.query<{ id: string; phone: string; email: string | null }>(
            `SELECT id, phone, email FROM members 
             WHERE gym_id = $1 AND id != $2 AND (
               ($3::text IS NOT NULL AND phone = $3) OR 
               ($4::text IS NOT NULL AND email IS NOT NULL AND lower(email) = lower($4))
             )
             LIMIT 1;`,
            [gymId, memberId, phone ? phone.trim() : null, (email && email.trim()) ? email.trim() : null]
          );

          if (existing.rows.length > 0) {
            const match = existing.rows[0];
            if (phone && match.phone === phone.trim()) {
              const err = new Error('A member with this phone number already exists in this gym') as Error & { statusCode: number };
              err.statusCode = 409;
              throw err;
            }
            if (email && email.trim() && match.email && match.email.toLowerCase() === email.trim().toLowerCase()) {
              const err = new Error('A member with this email already exists in this gym') as Error & { statusCode: number };
              err.statusCode = 409;
              throw err;
            }
          }
        }

        const updateData: Record<string, unknown> = {
          updatedAt: new Date()
        };

        if (firstName !== undefined) updateData.firstName = firstName.trim();
        if (lastName !== undefined) updateData.lastName = lastName && lastName.trim() ? lastName.trim() : null;
        if (phone !== undefined) updateData.phone = phone.trim();
        if (email !== undefined) updateData.email = email && email.trim() ? email.trim() : null;
        if (gender !== undefined) updateData.gender = gender;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
        if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName && emergencyContactName.trim() ? emergencyContactName.trim() : null;
        if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone && emergencyContactPhone.trim() ? emergencyContactPhone.trim() : null;
        if (status !== undefined) updateData.status = status;

        const rows = await db
          .update(members)
          .set(updateData)
          .where(and(eq(members.gymId, gymId), eq(members.id, memberId)))
          .returning();

        return rows[0] || null;
      });

      if (!updated) {
        return reply.status(404).send({ error: 'Member not found in this gym' });
      }

      return reply.send({ member: updated });
    } catch (err: unknown) {
      const dbErr = (err && typeof err === 'object' && 'cause' in err && err.cause ? err.cause : err) as {
        code?: string;
        constraint?: string;
        message?: string;
        statusCode?: number;
      };
      if (dbErr.statusCode === 409) {
        return reply.status(409).send({ error: dbErr.message });
      }
      if (dbErr.code === '23505') {
        if (dbErr.constraint?.includes('phone')) {
          return reply.status(409).send({ error: 'A member with this phone number already exists in this gym' });
        }
        if (dbErr.constraint?.includes('email')) {
          return reply.status(409).send({ error: 'A member with this email already exists in this gym' });
        }
        return reply.status(409).send({ error: 'A member with these details already exists in this gym' });
      }
      return reply.status(400).send({ error: dbErr.message || 'Failed to update member' });
    }
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

  // 6. List Membership Plans for Gym
  fastify.get<{
    Params: { gymId: string };
    Querystring: { active?: string };
  }>('/:gymId/plans', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId } = req.params;
    const { active } = req.query;
    const tenantContext = req.tenantContext!;

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      const conditions = [eq(membershipPlans.gymId, gymId)];
      if (active === 'true') {
        conditions.push(eq(membershipPlans.isActive, true));
      } else if (active === 'false') {
        conditions.push(eq(membershipPlans.isActive, false));
      }

      return tx
        .select()
        .from(membershipPlans)
        .where(and(...conditions))
        .orderBy(desc(membershipPlans.createdAt));
    });

    return reply.send({ plans: result });
  });

  // 7. Create Membership Plan (Owner or Manager only)
  fastify.post<{
    Params: { gymId: string };
    Body: {
      name: string;
      durationDays: number;
      priceCents: number;
      gymId?: string;
      gym_id?: string;
    };
  }>('/:gymId/plans', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId } = req.params;
    const tenantContext = req.tenantContext!;

    // Cross-tenant payload protection
    const bodyGymId = req.body.gym_id || req.body.gymId;
    if (bodyGymId && bodyGymId !== gymId) {
      return reply.status(403).send({ error: 'Cross-tenant violation: body gymId does not match route gymId' });
    }

    // Role check: only owner or manager can create plans
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager') {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can create membership plans' });
    }

    const { name, durationDays, priceCents } = req.body;
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Plan name is required' });
    }
    if (typeof durationDays !== 'number' || durationDays <= 0 || !Number.isInteger(durationDays)) {
      return reply.status(400).send({ error: 'Duration in days must be a positive integer' });
    }
    if (typeof priceCents !== 'number' || priceCents < 0 || !Number.isInteger(priceCents)) {
      return reply.status(400).send({ error: 'Price must be a non-negative integer in cents' });
    }

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      const [newPlan] = await tx
        .insert(membershipPlans)
        .values({
          gymId,
          name: name.trim(),
          durationDays,
          priceCents: BigInt(priceCents),
          isActive: true
        })
        .returning();
      return newPlan;
    });

    return reply.status(201).send({ plan: result });
  });

  // 8. Get Single Membership Plan
  fastify.get<{
    Params: { gymId: string; planId: string };
  }>('/:gymId/plans/:planId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, planId } = req.params;
    const tenantContext = req.tenantContext!;

    const plan = await withTenantContext(pool, tenantContext, async (tx) => {
      const rows = await tx
        .select()
        .from(membershipPlans)
        .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId)))
        .limit(1);
      return rows[0] || null;
    });

    if (!plan) {
      return reply.status(404).send({ error: 'Membership plan not found in this gym' });
    }

    return reply.send({ plan });
  });

  // 9. Update Membership Plan (Owner or Manager only)
  fastify.patch<{
    Params: { gymId: string; planId: string };
    Body: {
      name?: string;
      durationDays?: number;
      priceCents?: number;
      isActive?: boolean;
      gymId?: string;
      gym_id?: string;
    };
  }>('/:gymId/plans/:planId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, planId } = req.params;
    const tenantContext = req.tenantContext!;

    // Cross-tenant payload protection
    const bodyGymId = req.body.gym_id || req.body.gymId;
    if (bodyGymId && bodyGymId !== gymId) {
      return reply.status(403).send({ error: 'Cross-tenant violation: body gymId does not match route gymId' });
    }

    // Role check: only owner or manager can update plans
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager') {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can update membership plans' });
    }

    const { name, durationDays, priceCents, isActive } = req.body;
    const updates: Partial<{
      name: string;
      durationDays: number;
      priceCents: bigint;
      isActive: boolean;
    }> = {};

    if (name !== undefined) {
      if (!name.trim()) return reply.status(400).send({ error: 'Plan name cannot be empty' });
      updates.name = name.trim();
    }
    if (durationDays !== undefined) {
      if (typeof durationDays !== 'number' || durationDays <= 0 || !Number.isInteger(durationDays)) {
        return reply.status(400).send({ error: 'Duration in days must be a positive integer' });
      }
      updates.durationDays = durationDays;
    }
    if (priceCents !== undefined) {
      if (typeof priceCents !== 'number' || priceCents < 0 || !Number.isInteger(priceCents)) {
        return reply.status(400).send({ error: 'Price must be a non-negative integer in cents' });
      }
      updates.priceCents = BigInt(priceCents);
    }
    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No valid fields provided for update' });
    }

    const updatedPlan = await withTenantContext(pool, tenantContext, async (tx) => {
      const [updated] = await tx
        .update(membershipPlans)
        .set(updates)
        .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId)))
        .returning();
      return updated || null;
    });

    if (!updatedPlan) {
      return reply.status(404).send({ error: 'Membership plan not found in this gym' });
    }

    return reply.send({ plan: updatedPlan });
  });

  // 10. List Member Subscriptions
  fastify.get<{
    Params: { gymId: string; memberId: string };
  }>('/:gymId/members/:memberId/subscriptions', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, memberId } = req.params;
    const tenantContext = req.tenantContext!;

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      // First verify member exists in this gym
      const memberRows = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId)))
        .limit(1);

      if (memberRows.length === 0) {
        return null;
      }

      const rows = await tx
        .select({
          id: subscriptions.id,
          gymId: subscriptions.gymId,
          memberId: subscriptions.memberId,
          planId: subscriptions.planId,
          status: subscriptions.status,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          totalPriceCents: subscriptions.totalPriceCents,
          discountCents: subscriptions.discountCents,
          createdAt: subscriptions.createdAt,
          planName: membershipPlans.name,
          planDurationDays: membershipPlans.durationDays
        })
        .from(subscriptions)
        .innerJoin(membershipPlans, and(
          eq(membershipPlans.gymId, subscriptions.gymId),
          eq(membershipPlans.id, subscriptions.planId)
        ))
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, memberId)))
        .orderBy(desc(subscriptions.startDate));

      return rows;
    });

    if (result === null) {
      return reply.status(404).send({ error: 'Member not found in this gym' });
    }

    return reply.send({ subscriptions: result });
  });

  // 11. Create Subscription for Member
  fastify.post<{
    Params: { gymId: string; memberId: string };
    Body: {
      planId: string;
      startDate?: string;
      discountCents?: number;
      gymId?: string;
      gym_id?: string;
    };
  }>('/:gymId/members/:memberId/subscriptions', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, memberId } = req.params;
    const tenantContext = req.tenantContext!;

    // Cross-tenant payload protection
    const bodyGymId = req.body.gym_id || req.body.gymId;
    if (bodyGymId && bodyGymId !== gymId) {
      return reply.status(403).send({ error: 'Cross-tenant violation: body gymId does not match route gymId' });
    }

    const { planId, startDate, discountCents = 0 } = req.body;
    if (!planId) {
      return reply.status(400).send({ error: 'planId is required' });
    }
    if (typeof discountCents !== 'number' || discountCents < 0 || !Number.isInteger(discountCents)) {
      return reply.status(400).send({ error: 'discountCents must be a non-negative integer' });
    }

    try {
      const newSub = await withTenantContext(pool, tenantContext, async (tx) => {
        // 1. Verify member exists in this gym
        const memberRows = await tx
          .select({ id: members.id, firstName: members.firstName, lastName: members.lastName })
          .from(members)
          .where(and(eq(members.gymId, gymId), eq(members.id, memberId)))
          .limit(1);

        if (memberRows.length === 0) {
          const err = new Error('Member not found in this gym');
          (err as Error & { statusCode: number }).statusCode = 404;
          throw err;
        }

        // 2. Verify plan exists in this gym and is active
        const planRows = await tx
          .select()
          .from(membershipPlans)
          .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId)))
          .limit(1);

        if (planRows.length === 0) {
          const err = new Error('Membership plan not found in this gym');
          (err as Error & { statusCode: number }).statusCode = 404;
          throw err;
        }

        const plan = planRows[0];
        if (!plan.isActive) {
          const err = new Error('Cannot subscribe to an inactive membership plan');
          (err as Error & { statusCode: number }).statusCode = 400;
          throw err;
        }

        const planPriceNum = Number(plan.priceCents);
        if (discountCents > planPriceNum) {
          const err = new Error(`Discount (${discountCents}) cannot exceed plan price (${planPriceNum})`);
          (err as Error & { statusCode: number }).statusCode = 400;
          throw err;
        }

        // 3. Determine start date
        let resolvedStartDate: string;
        if (startDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            const err = new Error('startDate must be formatted as YYYY-MM-DD');
            (err as Error & { statusCode: number }).statusCode = 400;
            throw err;
          }
          resolvedStartDate = startDate;
        } else {
          // Default start date: if there is an active/queued subscription, start the day after its end date
          const latestSubRes = await tx
            .select({ endDate: subscriptions.endDate })
            .from(subscriptions)
            .where(and(
              eq(subscriptions.gymId, gymId),
              eq(subscriptions.memberId, memberId),
              sql`${subscriptions.status} IN ('active', 'queued')`
            ))
            .orderBy(desc(subscriptions.endDate))
            .limit(1);

          if (latestSubRes.length > 0) {
            const nextDayDate = new Date(latestSubRes[0].endDate);
            nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
            resolvedStartDate = nextDayDate.toISOString().split('T')[0];
          } else {
            resolvedStartDate = new Date().toISOString().split('T')[0];
          }
        }

        // Compute end_date = resolvedStartDate + (duration_days - 1) days
        const startD = new Date(resolvedStartDate);
        const endD = new Date(startD);
        endD.setUTCDate(endD.getUTCDate() + (plan.durationDays - 1));
        const resolvedEndDate = endD.toISOString().split('T')[0];

        // Determine initial status:
        // If start_date <= today: 'active'
        // If start_date > today: 'queued'
        const todayStr = new Date().toISOString().split('T')[0];
        const initialStatus = resolvedStartDate <= todayStr ? 'active' : 'queued';

        // 4. Insert subscription (trigger trg_subscriptions_overlap validates non-overlap atomically)
        const [insertedSub] = await tx
          .insert(subscriptions)
          .values({
            gymId,
            memberId,
            planId,
            status: initialStatus,
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            totalPriceCents: plan.priceCents,
            discountCents: BigInt(discountCents)
          })
          .returning();

        return insertedSub;
      });

      return reply.status(201).send({ subscription: newSub });
    } catch (err: unknown) {
      const dbErr = (err && typeof err === 'object' && 'cause' in err && err.cause ? err.cause : err) as {
        code?: string;
        constraint?: string;
        message?: string;
        statusCode?: number;
      };
      if (dbErr.statusCode) {
        return reply.status(dbErr.statusCode).send({ error: dbErr.message });
      }
      const msg = dbErr.message || (err instanceof Error ? err.message : String(err));
      if (msg.includes('overlap') || msg.includes('trg_subscriptions_overlap')) {
        return reply.status(409).send({ error: 'Subscription dates overlap with an existing active or queued subscription' });
      }
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to create subscription' });
    }
  });

  // 12. Get Single Subscription
  fastify.get<{
    Params: { gymId: string; subscriptionId: string };
  }>('/:gymId/subscriptions/:subscriptionId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, subscriptionId } = req.params;
    const tenantContext = req.tenantContext!;

    const sub = await withTenantContext(pool, tenantContext, async (tx) => {
      const rows = await tx
        .select({
          id: subscriptions.id,
          gymId: subscriptions.gymId,
          memberId: subscriptions.memberId,
          planId: subscriptions.planId,
          status: subscriptions.status,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          totalPriceCents: subscriptions.totalPriceCents,
          discountCents: subscriptions.discountCents,
          createdAt: subscriptions.createdAt,
          memberFirstName: members.firstName,
          memberLastName: members.lastName,
          memberNumber: members.memberNumber,
          memberPhone: members.phone,
          planName: membershipPlans.name,
          planDurationDays: membershipPlans.durationDays
        })
        .from(subscriptions)
        .innerJoin(members, and(eq(members.gymId, subscriptions.gymId), eq(members.id, subscriptions.memberId)))
        .innerJoin(membershipPlans, and(eq(membershipPlans.gymId, subscriptions.gymId), eq(membershipPlans.id, subscriptions.planId)))
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.id, subscriptionId)))
        .limit(1);

      return rows[0] || null;
    });

    if (!sub) {
      return reply.status(404).send({ error: 'Subscription not found in this gym' });
    }

    return reply.send({ subscription: sub });
  });

  // 13. Cancel Subscription (Owner or Manager only)
  fastify.post<{
    Params: { gymId: string; subscriptionId: string };
    Body?: { gymId?: string; gym_id?: string };
  }>('/:gymId/subscriptions/:subscriptionId/cancel', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, subscriptionId } = req.params;
    const tenantContext = req.tenantContext!;

    // Cross-tenant payload protection
    const bodyGymId = req.body?.gym_id || req.body?.gymId;
    if (bodyGymId && bodyGymId !== gymId) {
      return reply.status(403).send({ error: 'Cross-tenant violation: body gymId does not match route gymId' });
    }

    // Role check: only owner or manager can cancel subscriptions
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager') {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can cancel subscriptions' });
    }

    const cancelledSub = await withTenantContext(pool, tenantContext, async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: 'cancelled' })
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.id, subscriptionId)))
        .returning();
      return updated || null;
    });

    if (!cancelledSub) {
      return reply.status(404).send({ error: 'Subscription not found in this gym' });
    }

    return reply.send({ subscription: cancelledSub });
  });
};

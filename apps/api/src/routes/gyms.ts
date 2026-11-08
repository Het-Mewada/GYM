import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { withTenantContext, members, eq, and, or, ilike, isNull, desc, sql } from '@gym/db';
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
        const existingRes = await client.query<{ out_user_id: string; out_full_name: string }>(
          'SELECT out_user_id, out_full_name FROM auth_lookup_user_by_phone($1);',
          [normalizedPhone]
        );

        if (existingRes.rows.length > 0) {
          targetOwnerId = existingRes.rows[0].out_user_id;
          createdAdminUser = {
            id: targetOwnerId,
            fullName: existingRes.rows[0].out_full_name,
            phone: normalizedPhone,
            email: adminEmail?.trim() || null
          };
        } else {
          const passHash = await hashPassword(adminPassword);
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

      const res = await client.query<{ provision_gym: string }>(
        'SELECT provision_gym($1, $2, $3, $4, $5, $6, $7) as provision_gym;',
        [targetOwnerId, name.trim(), slug.trim().toLowerCase(), country, timezone, currency, taxRateBasisPoints]
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
};

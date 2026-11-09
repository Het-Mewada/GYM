import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import crypto from 'node:crypto';
import { withTenantContext, members, memberRegistrationRequests, membershipPlans, subscriptions, paymentTransactions, attendanceLogs, csvImportJobs, eq, and, or, ilike, isNull, desc, sql } from '@gym/db';
import { PaymentRecordSchema, RefundRecordSchema, AttendanceCheckInSchema, AttendanceVoidSchema, MemberRegistrationRejectSchema, parseCsv, normalizeCsvHeader, validateCsvRow, type PiiFreeCsvError } from '@gym/shared';
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
      const conditions = [eq(membershipPlans.gymId, gymId), isNull(membershipPlans.deletedAt)];
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

    // Role check: only owner, manager, or superadmin can create plans
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager' && !req.user?.isPlatformAdmin) {
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
        .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId), isNull(membershipPlans.deletedAt)))
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

    // Role check: only owner, manager, or superadmin can update plans
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager' && !req.user?.isPlatformAdmin) {
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
        .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId), isNull(membershipPlans.deletedAt)))
        .returning();
      return updated || null;
    });

    if (!updatedPlan) {
      return reply.status(404).send({ error: 'Membership plan not found in this gym' });
    }

    return reply.send({ plan: updatedPlan });
  });

  // 9b. Delete Membership Plan (Owner, Manager, or Superadmin only)
  fastify.delete<{
    Params: { gymId: string; planId: string };
  }>('/:gymId/plans/:planId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, planId } = req.params;
    const tenantContext = req.tenantContext!;

    // Role check: only owner, manager, or superadmin can delete plans
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager' && !req.user?.isPlatformAdmin) {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can delete membership plans' });
    }

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      // Verify plan exists in this gym and is not already deleted
      const [existingPlan] = await tx
        .select()
        .from(membershipPlans)
        .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId), isNull(membershipPlans.deletedAt)))
        .limit(1);

      if (!existingPlan) {
        return { notFound: true };
      }

      // Check if any subscriptions reference this plan
      const subRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.planId, planId)));

      const subCount = Number(subRows[0]?.count || 0);

      if (subCount > 0) {
        // Soft delete/archive to preserve historical subscription and financial records
        await tx
          .update(membershipPlans)
          .set({
            deletedAt: new Date(),
            isActive: false
          })
          .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId)));

        return { success: true, archived: true, subCount };
      } else {
        // Hard delete unreferenced plan
        await tx
          .delete(membershipPlans)
          .where(and(eq(membershipPlans.gymId, gymId), eq(membershipPlans.id, planId)));

        return { success: true, deleted: true, subCount: 0 };
      }
    });

    if (result.notFound) {
      return reply.status(404).send({ error: 'Membership plan not found in this gym' });
    }

    return reply.send({
      success: true,
      message: result.archived
        ? 'Membership plan archived successfully (preserved for historical subscriptions).'
        : 'Membership plan deleted successfully.',
      archived: Boolean(result.archived)
    });
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

    // Role check: only owner, manager, or superadmin can cancel subscriptions
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager' && !req.user?.isPlatformAdmin) {
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

  // 17. LIST PAYMENTS
  fastify.get<{
    Params: { gymId: string };
    Querystring: {
      memberId?: string;
      subscriptionId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/:gymId/payments', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId } = req.params;
    const { memberId, subscriptionId, limit = '50', offset = '0' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const tenantContext = req.tenantContext!;

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      const conditions = [eq(paymentTransactions.gymId, gymId)];
      if (memberId) {
        conditions.push(eq(paymentTransactions.memberId, memberId));
      }
      if (subscriptionId) {
        conditions.push(eq(paymentTransactions.subscriptionId, subscriptionId));
      }

      const rows = await tx
        .select({
          id: paymentTransactions.id,
          gymId: paymentTransactions.gymId,
          memberId: paymentTransactions.memberId,
          subscriptionId: paymentTransactions.subscriptionId,
          receiptNumber: paymentTransactions.receiptNumber,
          type: paymentTransactions.type,
          method: paymentTransactions.method,
          amountCents: paymentTransactions.amountCents,
          taxCents: paymentTransactions.taxCents,
          currency: paymentTransactions.currency,
          effectiveDate: paymentTransactions.effectiveDate,
          externalReference: paymentTransactions.externalReference,
          parentTransactionId: paymentTransactions.parentTransactionId,
          notes: paymentTransactions.notes,
          recordedByUserId: paymentTransactions.recordedByUserId,
          createdAt: paymentTransactions.createdAt,
          memberFirstName: members.firstName,
          memberLastName: members.lastName,
          memberNumber: members.memberNumber,
          memberPhone: members.phone
        })
        .from(paymentTransactions)
        .leftJoin(members, and(eq(members.gymId, paymentTransactions.gymId), eq(members.id, paymentTransactions.memberId)))
        .where(and(...conditions))
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(parsedLimit)
        .offset(parsedOffset);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentTransactions)
        .where(and(...conditions));

      return {
        payments: rows,
        total: countResult?.count || 0,
        limit: parsedLimit,
        offset: parsedOffset
      };
    });

    return reply.send(result);
  });

  // 18. RECORD PAYMENT
  fastify.post<{
    Params: { gymId: string };
    Body: {
      memberId: string;
      subscriptionId?: string | null;
      idempotencyKey: string;
      amountCents: number;
      method: 'cash' | 'upi' | 'card_pos' | 'bank_transfer';
      externalReference?: string | null;
      notes?: string | null;
    };
  }>('/:gymId/payments', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId } = req.params;
    const tenantContext = req.tenantContext!;

    const parseResult = PaymentRecordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parseResult.error.format()
      });
    }

    const {
      memberId,
      subscriptionId,
      idempotencyKey,
      amountCents,
      method,
      externalReference,
      notes
    } = parseResult.data;

    try {
      const payment = await withTenantContext(pool, tenantContext, async (tx) => {
        // 1. Idempotency replay check
        const [existing] = await tx
          .select()
          .from(paymentTransactions)
          .where(and(eq(paymentTransactions.gymId, gymId), eq(paymentTransactions.idempotencyKey, idempotencyKey)));

        if (existing) {
          return { isReplay: true, transaction: existing };
        }

        // 2. Validate member exists in this gym
        const [member] = await tx
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.gymId, gymId), eq(members.id, memberId), isNull(members.deletedAt)));

        if (!member) {
          throw new Error('MEMBER_NOT_FOUND');
        }

        // 3. If subscriptionId provided, validate it belongs to this member and gym
        if (subscriptionId) {
          const [sub] = await tx
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.id, subscriptionId), eq(subscriptions.memberId, memberId)));

          if (!sub) {
            throw new Error('SUBSCRIPTION_NOT_FOUND');
          }
        }

        // 4. Fetch tenant tax rate basis points
        const client = await pool.connect();
        let taxBasisPoints = 1800; // Default 18% GST
        let receiptNumber = '';
        try {
          const tenantRes = await client.query<{ tax_rate_basis_points: number }>(
            'SELECT tax_rate_basis_points FROM tenants WHERE id = $1;',
            [gymId]
          );
          if (tenantRes.rows.length > 0 && tenantRes.rows[0].tax_rate_basis_points != null) {
            taxBasisPoints = Number(tenantRes.rows[0].tax_rate_basis_points);
          }

          // 5. Generate monotonic tax invoice / receipt number (REC-YYYYMM-000001)
          await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
          const receiptRes = await client.query<{ generate_next_receipt_number: string }>(
            'SELECT generate_next_receipt_number($1) as generate_next_receipt_number;',
            [gymId]
          );
          receiptNumber = receiptRes.rows[0]?.generate_next_receipt_number || `REC-${Date.now()}`;
        } finally {
          client.release();
        }

        // Calculate inclusive tax cents: amount * taxRate / (10000 + taxRate)
        const taxCents = taxBasisPoints > 0
          ? Math.round((amountCents * taxBasisPoints) / (10000 + taxBasisPoints))
          : 0;

        // 6. Insert into append-only payment_transactions ledger
        const [inserted] = await tx
          .insert(paymentTransactions)
          .values({
            gymId,
            memberId,
            subscriptionId: subscriptionId || null,
            idempotencyKey,
            receiptNumber,
            type: 'payment',
            method,
            amountCents: BigInt(amountCents),
            taxCents: BigInt(taxCents),
            currency: 'INR',
            effectiveDate: sql`CURRENT_DATE`,
            externalReference: externalReference || null,
            notes: notes || null,
            recordedByUserId: tenantContext.userId
          })
          .returning();

        return { isReplay: false, transaction: inserted };
      });

      const statusCode = payment.isReplay ? 200 : 201;
      return reply.status(statusCode).send({ payment: payment.transaction, isReplay: payment.isReplay });
    } catch (err: unknown) {
      if ((err as Error).message === 'MEMBER_NOT_FOUND') {
        return reply.status(404).send({ error: 'Member not found in this gym' });
      }
      if ((err as Error).message === 'SUBSCRIPTION_NOT_FOUND') {
        return reply.status(404).send({ error: 'Subscription not found for this member' });
      }
      throw err;
    }
  });

  // 19. GET SINGLE PAYMENT RECEIPT
  fastify.get<{
    Params: { gymId: string; paymentId: string };
  }>('/:gymId/payments/:paymentId', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId, paymentId } = req.params;
    const tenantContext = req.tenantContext!;

    const payment = await withTenantContext(pool, tenantContext, async (tx) => {
      const [row] = await tx
        .select({
          id: paymentTransactions.id,
          gymId: paymentTransactions.gymId,
          memberId: paymentTransactions.memberId,
          subscriptionId: paymentTransactions.subscriptionId,
          receiptNumber: paymentTransactions.receiptNumber,
          type: paymentTransactions.type,
          method: paymentTransactions.method,
          amountCents: paymentTransactions.amountCents,
          taxCents: paymentTransactions.taxCents,
          currency: paymentTransactions.currency,
          effectiveDate: paymentTransactions.effectiveDate,
          externalReference: paymentTransactions.externalReference,
          parentTransactionId: paymentTransactions.parentTransactionId,
          notes: paymentTransactions.notes,
          recordedByUserId: paymentTransactions.recordedByUserId,
          createdAt: paymentTransactions.createdAt,
          memberFirstName: members.firstName,
          memberLastName: members.lastName,
          memberNumber: members.memberNumber,
          memberPhone: members.phone,
          memberEmail: members.email
        })
        .from(paymentTransactions)
        .leftJoin(members, and(eq(members.gymId, paymentTransactions.gymId), eq(members.id, paymentTransactions.memberId)))
        .where(and(eq(paymentTransactions.gymId, gymId), eq(paymentTransactions.id, paymentId)));

      return row || null;
    });

    if (!payment) {
      return reply.status(404).send({ error: 'Payment transaction not found in this gym' });
    }

    return reply.send({ payment });
  });

  // 20. REFUND PAYMENT
  fastify.post<{
    Params: { gymId: string; paymentId: string };
    Body: {
      idempotencyKey: string;
      amountCents: number;
      method?: 'cash' | 'upi' | 'card_pos' | 'bank_transfer';
      notes?: string | null;
    };
  }>('/:gymId/payments/:paymentId/refund', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId, paymentId } = req.params;
    const tenantContext = req.tenantContext!;

    // RBAC: only owner or manager can issue refunds
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager') {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can issue refunds' });
    }

    const parseResult = RefundRecordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parseResult.error.format()
      });
    }

    const { idempotencyKey, amountCents, method, cancelSubscription, notes } = parseResult.data;

    try {
      const refundResult = await withTenantContext(pool, tenantContext, async (tx) => {
        // Idempotency check
        const [existing] = await tx
          .select()
          .from(paymentTransactions)
          .where(and(eq(paymentTransactions.gymId, gymId), eq(paymentTransactions.idempotencyKey, idempotencyKey)));

        if (existing) {
          return { isReplay: true, transaction: existing };
        }

        // Fetch parent payment transaction
        const [parent] = await tx
          .select()
          .from(paymentTransactions)
          .where(and(eq(paymentTransactions.gymId, gymId), eq(paymentTransactions.id, paymentId)));

        if (!parent) {
          throw new Error('PARENT_NOT_FOUND');
        }

        if (parent.type !== 'payment') {
          throw new Error('PARENT_NOT_A_PAYMENT');
        }

        // If requested or required, cancel linked subscription to satisfy refund semantics
        if (cancelSubscription && parent.subscriptionId) {
          await tx
            .update(subscriptions)
            .set({ status: 'cancelled' })
            .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.id, parent.subscriptionId)));
        }

        // Generate receipt number for refund
        const client = await pool.connect();
        let refundReceiptNumber = '';
        try {
          await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
          const receiptRes = await client.query<{ generate_next_receipt_number: string }>(
            'SELECT generate_next_receipt_number($1) as generate_next_receipt_number;',
            [gymId]
          );
          refundReceiptNumber = (receiptRes.rows[0]?.generate_next_receipt_number || `REC-${Date.now()}`) + '-REF';
        } finally {
          client.release();
        }

        // Insert refund into payment_transactions (will trigger trg_payment_refund_limit & trg_payment_refund_semantics in PG)
        // Ledger requirement: refunds must have amountCents < 0 per check_payment_type_amount_sign constraint
        const [insertedRefund] = await tx
          .insert(paymentTransactions)
          .values({
            gymId,
            memberId: parent.memberId,
            subscriptionId: parent.subscriptionId,
            idempotencyKey,
            receiptNumber: refundReceiptNumber,
            type: 'refund',
            method: method || parent.method,
            amountCents: -BigInt(Math.abs(amountCents)),
            taxCents: BigInt(0),
            currency: 'INR',
            effectiveDate: sql`CURRENT_DATE`,
            parentTransactionId: parent.id,
            notes: notes || `Refund for receipt ${parent.receiptNumber || parent.id}`,
            recordedByUserId: tenantContext.userId
          })
          .returning();

        return { isReplay: false, transaction: insertedRefund };
      });

      const statusCode = refundResult.isReplay ? 200 : 201;
      return reply.status(statusCode).send({ refund: refundResult.transaction, isReplay: refundResult.isReplay });
    } catch (err: unknown) {
      if ((err as Error).message === 'PARENT_NOT_FOUND') {
        return reply.status(404).send({ error: 'Original payment transaction not found in this gym' });
      }
      if ((err as Error).message === 'PARENT_NOT_A_PAYMENT') {
        return reply.status(400).send({ error: 'Cannot issue a refund for a non-payment transaction' });
      }

      // Check for PostgreSQL trigger rejection (e.g. refund exceeds original payment)
      const rawMsg = (err as { cause?: { message?: string } })?.cause?.message || (err as Error)?.message || '';
      if (rawMsg.includes('exceed') || rawMsg.includes('validate_refund_limit') || rawMsg.includes('Refund amount')) {
        return reply.status(409).send({ error: rawMsg || 'Refund amount exceeds maximum refundable limit for this payment' });
      }
      if (rawMsg.includes('validate_subscription_refund_semantics') || rawMsg.includes('Invalid refund semantics')) {
        return reply.status(409).send({ error: rawMsg || 'Subscription status prohibits direct refund without adjustment' });
      }

      throw err;
    }
  });

  // 21. MEMBER FINANCIAL SUMMARY & STATEMENT
  fastify.get<{
    Params: { gymId: string; memberId: string };
  }>('/:gymId/members/:memberId/financials', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId, memberId } = req.params;
    const tenantContext = req.tenantContext!;

    const financialData = await withTenantContext(pool, tenantContext, async (tx) => {
      // 1. Verify member exists
      const [member] = await tx
        .select({ id: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber })
        .from(members)
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId), isNull(members.deletedAt)));

      if (!member) {
        return null;
      }

      // 2. Fetch all payment ledger transactions
      const txRows = await tx
        .select()
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.gymId, gymId), eq(paymentTransactions.memberId, memberId)))
        .orderBy(desc(paymentTransactions.createdAt));

      // 3. Fetch all member subscriptions
      const subRows = await tx
        .select({
          id: subscriptions.id,
          totalPriceCents: subscriptions.totalPriceCents,
          discountCents: subscriptions.discountCents,
          status: subscriptions.status
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, memberId)));

      let totalPaidCents = 0;
      let totalRefundedCents = 0;

      for (const t of txRows) {
        const amt = Number(t.amountCents);
        if (t.type === 'payment' || t.type === 'opening_balance') {
          totalPaidCents += Math.abs(amt);
        } else if (t.type === 'refund' || t.type === 'reversal') {
          totalRefundedCents += Math.abs(amt);
        }
      }

      const netPaidCents = totalPaidCents - totalRefundedCents;

      // Total billed from non-cancelled subscriptions
      let totalBilledCents = 0;
      for (const s of subRows) {
        if (s.status !== 'cancelled') {
          const price = Number(s.totalPriceCents) - Number(s.discountCents);
          totalBilledCents += Math.max(price, 0);
        }
      }

      const balanceCents = totalBilledCents - netPaidCents;

      return {
        member,
        summary: {
          totalPaidCents,
          totalRefundedCents,
          netPaidCents,
          totalBilledCents,
          balanceCents,
          isDuesPending: balanceCents > 0
        },
        transactions: txRows
      };
    });

    if (!financialData) {
      return reply.status(404).send({ error: 'Member not found in this gym' });
    }

    return reply.send(financialData);
  });

  // 22. ATTENDANCE CHECK-IN
  fastify.post<{
    Params: { gymId: string };
    Body: {
      memberId: string;
      method?: 'staff_manual' | 'qr_kiosk';
      wasOverride?: boolean;
      overrideReason?: 'medical_clearance_pending' | 'payment_promised_today' | 'forgot_wallet' | 'guest_pass' | 'other_owner_approved' | null;
      gymId?: string;
    };
  }>('/:gymId/attendance/check-in', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId } = req.params;
    const tenantContext = req.tenantContext!;

    const parseResult = AttendanceCheckInSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parseResult.error.format()
      });
    }

    const { memberId, method, wasOverride, overrideReason } = parseResult.data;

    try {
      const result = await withTenantContext(pool, tenantContext, async (tx) => {
        // 1. Verify member exists in this gym
        const [member] = await tx
          .select({ id: members.id, status: members.status })
          .from(members)
          .where(and(eq(members.gymId, gymId), eq(members.id, memberId), isNull(members.deletedAt)));

        if (!member) {
          throw new Error('MEMBER_NOT_FOUND');
        }

        // 2. Check for active check-in on today's date
        const existingAttendance = await tx.execute<{ id: string }>(
          sql`SELECT id FROM attendance_logs WHERE gym_id = ${gymId}::uuid AND member_id = ${memberId}::uuid AND attendance_date = CURRENT_DATE AND is_voided = false;`
        );

        if (existingAttendance.rows.length > 0) {
          throw new Error('ALREADY_CHECKED_IN');
        }

        // 3. Verify active subscription covering today
        const activeSub = await tx.execute<{ id: string }>(
          sql`SELECT id FROM subscriptions WHERE gym_id = ${gymId}::uuid AND member_id = ${memberId}::uuid AND status = 'active' AND CURRENT_DATE >= start_date AND CURRENT_DATE <= end_date;`
        );

        if (activeSub.rows.length === 0 && !wasOverride) {
          throw new Error('NO_ACTIVE_SUBSCRIPTION');
        }

        // 4. Record attendance
        const [inserted] = await tx
          .insert(attendanceLogs)
          .values({
            gymId,
            memberId,
            attendanceDate: sql`CURRENT_DATE`,
            checkInTime: sql`CURRENT_TIMESTAMP`,
            method: method || 'staff_manual',
            recordedByUserId: tenantContext.userId,
            wasOverride: wasOverride || false,
            overrideReason: wasOverride ? overrideReason : null,
            isVoided: false
          })
          .returning();

        return inserted;
      });

      return reply.status(201).send({ attendance: result });
    } catch (err: unknown) {
      if ((err as Error).message === 'MEMBER_NOT_FOUND') {
        return reply.status(404).send({ error: 'Member not found in this gym' });
      }
      if ((err as Error).message === 'ALREADY_CHECKED_IN') {
        return reply.status(409).send({ error: 'Member has already checked in today' });
      }
      if ((err as Error).message === 'NO_ACTIVE_SUBSCRIPTION') {
        return reply.status(422).send({ error: 'Member has no active subscription covering today. Override required.' });
      }
      const rawMsg = (err as { cause?: { message?: string } })?.cause?.message || (err as Error)?.message || '';
      if (rawMsg.includes('uq_member_daily_attendance')) {
        return reply.status(409).send({ error: 'Member has already checked in today' });
      }
      throw err;
    }
  });

  // 23. VOID ATTENDANCE RECORD
  fastify.post<{
    Params: { gymId: string; attendanceId: string };
    Body: { voidReason: string; gymId?: string };
  }>('/:gymId/attendance/:attendanceId/void', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId, attendanceId } = req.params;
    const tenantContext = req.tenantContext!;

    // RBAC: only owner or manager can void attendance
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager') {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can void attendance records' });
    }

    const parseResult = AttendanceVoidSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: parseResult.error.format()
      });
    }

    const { voidReason } = parseResult.data;

    try {
      await withTenantContext(pool, tenantContext, async (tx) => {
        await tx.execute(
          sql`SELECT void_attendance_record(${gymId}::uuid, ${attendanceId}::uuid, ${voidReason}::text);`
        );
      });

      return reply.send({ success: true, message: 'Attendance record voided successfully' });
    } catch (err: unknown) {
      const rawMsg = (err as { cause?: { message?: string } })?.cause?.message || (err as Error)?.message || '';
      if (rawMsg.includes('not found') || rawMsg.includes('not authorized')) {
        if (rawMsg.includes('not authorized')) {
          return reply.status(403).send({ error: rawMsg });
        }
        return reply.status(404).send({ error: 'Active attendance record not found in this gym' });
      }
      throw err;
    }
  });

  // 24. LIST ATTENDANCE LOGS
  fastify.get<{
    Params: { gymId: string };
    Querystring: {
      date?: string;
      memberId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/:gymId/attendance', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId } = req.params;
    const { date, memberId, limit = '50', offset = '0' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const tenantContext = req.tenantContext!;

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      const conditions = [eq(attendanceLogs.gymId, gymId)];
      if (date) {
        conditions.push(eq(attendanceLogs.attendanceDate, date));
      }
      if (memberId) {
        conditions.push(eq(attendanceLogs.memberId, memberId));
      }

      const rows = await tx
        .select({
          id: attendanceLogs.id,
          gymId: attendanceLogs.gymId,
          memberId: attendanceLogs.memberId,
          attendanceDate: attendanceLogs.attendanceDate,
          checkInTime: attendanceLogs.checkInTime,
          method: attendanceLogs.method,
          recordedByUserId: attendanceLogs.recordedByUserId,
          wasOverride: attendanceLogs.wasOverride,
          overrideReason: attendanceLogs.overrideReason,
          isVoided: attendanceLogs.isVoided,
          voidedAt: attendanceLogs.voidedAt,
          voidedByUserId: attendanceLogs.voidedByUserId,
          voidReason: attendanceLogs.voidReason,
          createdAt: attendanceLogs.createdAt,
          memberFirstName: members.firstName,
          memberLastName: members.lastName,
          memberNumber: members.memberNumber,
          memberPhone: members.phone
        })
        .from(attendanceLogs)
        .leftJoin(members, and(eq(members.gymId, attendanceLogs.gymId), eq(members.id, attendanceLogs.memberId)))
        .where(and(...conditions))
        .orderBy(desc(attendanceLogs.checkInTime))
        .limit(parsedLimit)
        .offset(parsedOffset);

      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceLogs)
        .where(and(...conditions));

      return {
        attendance: rows,
        total: countResult?.count || 0,
        limit: parsedLimit,
        offset: parsedOffset
      };
    });

    return reply.send(result);
  });

  // 25. GET MEMBER ATTENDANCE LOGS
  fastify.get<{
    Params: { gymId: string; memberId: string };
    Querystring: {
      limit?: string;
      offset?: string;
    };
  }>('/:gymId/members/:memberId/attendance', { preHandler: [authenticateUser, requireTenant] }, async (req, reply) => {
    const { gymId, memberId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const tenantContext = req.tenantContext!;

    const result = await withTenantContext(pool, tenantContext, async (tx) => {
      const [member] = await tx
        .select({ id: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber })
        .from(members)
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId), isNull(members.deletedAt)));

      if (!member) {
        return null;
      }

      const rows = await tx
        .select()
        .from(attendanceLogs)
        .where(and(eq(attendanceLogs.gymId, gymId), eq(attendanceLogs.memberId, memberId)))
        .orderBy(desc(attendanceLogs.checkInTime))
        .limit(parsedLimit)
        .offset(parsedOffset);

      const [totalCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceLogs)
        .where(and(eq(attendanceLogs.gymId, gymId), eq(attendanceLogs.memberId, memberId), eq(attendanceLogs.isVoided, false)));

      const [monthCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceLogs)
        .where(and(
          eq(attendanceLogs.gymId, gymId),
          eq(attendanceLogs.memberId, memberId),
          eq(attendanceLogs.isVoided, false),
          sql`DATE_TRUNC('month', attendance_date) = DATE_TRUNC('month', CURRENT_DATE)`
        ));

      return {
        member,
        summary: {
          totalCheckIns: totalCount?.count || 0,
          checkInsThisMonth: monthCount?.count || 0
        },
        attendance: rows,
        limit: parsedLimit,
        offset: parsedOffset
      };
    });

    if (!result) {
      return reply.status(404).send({ error: 'Member not found in this gym' });
    }

    return reply.send(result);
  });

  // 17. List Member Registration Requests
  fastify.get<{
    Params: { gymId: string };
    Querystring: { status?: string };
  }>('/:gymId/registration-requests', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId } = req.params;
    const tenantContext = req.tenantContext!;
    const { status } = req.query;

    const rows = await withTenantContext(pool, tenantContext, async (tx) => {
      const conditions = [eq(memberRegistrationRequests.gymId, gymId)];
      if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        conditions.push(eq(memberRegistrationRequests.status, status));
      }

      return tx
        .select()
        .from(memberRegistrationRequests)
        .where(and(...conditions))
        .orderBy(desc(memberRegistrationRequests.createdAt));
    });

    return reply.send({ requests: rows, count: rows.length });
  });

  // 18. Approve Member Registration Request
  fastify.post<{
    Params: { gymId: string; requestId: string };
  }>('/:gymId/registration-requests/:requestId/approve', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, requestId } = req.params;
    const tenantContext = req.tenantContext!;

    const isAuthorized = req.user?.isPlatformAdmin || tenantContext.role === 'owner' || tenantContext.role === 'manager';
    if (!isAuthorized) {
      return reply.status(403).send({ error: 'Only gym owners or managers can approve registration requests' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [tenantContext.userId]);

      const res = await client.query<{ approve_member_registration_request: string }>(
        'SELECT approve_member_registration_request($1, $2, $3) as approve_member_registration_request;',
        [gymId, requestId, tenantContext.userId]
      );
      const memberId = res.rows[0]?.approve_member_registration_request;

      // Fetch the newly created member
      const memberRes = await client.query<{
        id: string;
        gym_id: string;
        member_number: string;
        first_name: string;
        last_name: string | null;
        phone: string;
        email: string | null;
        gender: string;
        status: string;
        joined_date: string;
      }>(
        'SELECT id, gym_id, member_number, first_name, last_name, phone, email, gender, status, joined_date FROM members WHERE gym_id = $1 AND id = $2;',
        [gymId, memberId]
      );
      const m = memberRes.rows[0];
      const memberObj = m ? {
        id: m.id,
        gymId: m.gym_id,
        memberNumber: m.member_number,
        firstName: m.first_name,
        lastName: m.last_name,
        phone: m.phone,
        email: m.email,
        gender: m.gender,
        status: m.status,
        joinedDate: m.joined_date
      } : null;

      await client.query('COMMIT');

      return reply.send({
        success: true,
        memberId,
        member: memberObj,
        message: 'Registration request approved and member enrolled successfully.'
      });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return reply.status(404).send({ error: msg });
      }
      if (msg.includes('already exists') || msg.includes('already approved') || msg.includes('already rejected') || msg.includes('already')) {
        return reply.status(409).send({ error: msg });
      }
      return reply.status(400).send({ error: msg });
    } finally {
      client.release();
    }
  });

  // 19. Reject Member Registration Request
  fastify.post<{
    Params: { gymId: string; requestId: string };
    Body: unknown;
  }>('/:gymId/registration-requests/:requestId/reject', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, requestId } = req.params;
    const tenantContext = req.tenantContext!;

    const isAuthorized = req.user?.isPlatformAdmin || tenantContext.role === 'owner' || tenantContext.role === 'manager';
    if (!isAuthorized) {
      return reply.status(403).send({ error: 'Only gym owners or managers can reject registration requests' });
    }

    const parseRes = MemberRegistrationRejectSchema.safeParse(req.body || {});
    if (!parseRes.success) {
      return reply.status(400).send({ error: 'Invalid rejection payload' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [tenantContext.userId]);

      await client.query(
        'SELECT reject_member_registration_request($1, $2, $3, $4);',
        [gymId, requestId, tenantContext.userId, parseRes.data.reason || null]
      );

      await client.query('COMMIT');

      return reply.send({
        success: true,
        message: 'Registration request rejected.'
      });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return reply.status(404).send({ error: msg });
      }
      if (msg.includes('already')) {
        return reply.status(409).send({ error: msg });
      }
      return reply.status(400).send({ error: msg });
    } finally {
      client.release();
    }
  });

  // 17. CSV Member Importer: Upload & transactional batch import
  fastify.post<{
    Params: { gymId: string };
  }>('/:gymId/members/import-csv', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId } = req.params;
    const tenantContext = req.tenantContext!;

    // Check permissions: owner, manager, or superadmin
    if (tenantContext.role !== 'owner' && tenantContext.role !== 'manager' && !req.user?.isPlatformAdmin) {
      return reply.status(403).send({ error: 'Forbidden: Only owners and managers can import members via CSV' });
    }

    let csvText = '';
    let fileName = 'members.csv';

    if (req.isMultipart()) {
      const fileData = await req.file();
      if (!fileData) {
        return reply.status(400).send({ error: 'No CSV file uploaded' });
      }
      fileName = fileData.filename || 'members.csv';
      const buffer = await fileData.toBuffer();
      csvText = buffer.toString('utf-8');
    } else if (req.body && typeof req.body === 'object') {
      const b = req.body as { csvContent?: string; fileName?: string };
      csvText = b.csvContent || '';
      fileName = b.fileName || 'members.csv';
    } else if (typeof req.body === 'string') {
      csvText = req.body;
    }

    if (!csvText || !csvText.trim()) {
      return reply.status(400).send({ error: 'CSV file is empty' });
    }

    // Compute SHA-256 hash to prevent duplicate uploads
    const fileSha256 = crypto.createHash('sha256').update(csvText.trim()).digest('hex');

    // Check if duplicate file was already imported for this gym
    const existingJob = await withTenantContext(pool, tenantContext, async (db) => {
      return db
        .select()
        .from(csvImportJobs)
        .where(and(eq(csvImportJobs.gymId, gymId), eq(csvImportJobs.fileSha256, fileSha256)));
    });

    if (existingJob.length > 0) {
      return reply.status(409).send({
        error: 'This CSV file has already been imported for this gym (duplicate file hash detected).'
      });
    }

    // Parse CSV
    const parsed = parseCsv(csvText);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      return reply.status(400).send({ error: 'CSV contains no data rows to import' });
    }

    const normalizedHeaders = parsed.headers.map(normalizeCsvHeader);
    if (!normalizedHeaders.includes('firstName') || !normalizedHeaders.includes('phone')) {
      return reply.status(400).send({
        error: 'CSV must contain at least "First Name" and "Phone" columns'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [tenantContext.userId]);

      // Insert initial job record in processing status
      const insertJobRes = await client.query<{ id: string }>(
        `INSERT INTO csv_import_jobs (gym_id, file_name, file_sha256, total_rows, processed_rows, error_count, errors_json, status, created_by_user_id)
         VALUES ($1, $2, $3, $4, 0, 0, '[]'::jsonb, 'processing', $5)
         RETURNING id;`,
        [gymId, fileName, fileSha256, parsed.rows.length, tenantContext.userId]
      );
      const jobId = insertJobRes.rows[0].id;

      // Fetch all existing active member phones & emails in this gym for duplicate checking
      const existingMembersRes = await client.query<{ phone: string; email: string | null }>(
        `SELECT phone, email FROM members WHERE gym_id = $1 AND deleted_at IS NULL;`,
        [gymId]
      );
      const existingPhones = new Set<string>(existingMembersRes.rows.map((r) => r.phone));
      const existingEmails = new Set<string>(
        existingMembersRes.rows.filter((r) => r.email).map((r) => r.email!.toLowerCase())
      );

      const seenFilePhones = new Set<string>();
      const seenFileEmails = new Set<string>();
      const errorsList: PiiFreeCsvError[] = [];
      let importedCount = 0;

      for (let i = 0; i < parsed.rows.length; i++) {
        const rowNumber = i + 2; // 1-based row number (row 1 is header)
        const rowValues = parsed.rows[i];
        const rowObj: Record<string, string> = {};
        normalizedHeaders.forEach((header, idx) => {
          rowObj[header] = rowValues[idx] || '';
        });

        const validation = validateCsvRow(rowObj, rowNumber);
        if (!validation.valid) {
          errorsList.push(...validation.errors);
          continue;
        }

        const member = validation.member;

        // Check duplicate within the same CSV file
        if (seenFilePhones.has(member.phone)) {
          errorsList.push({
            row: rowNumber,
            field: 'phone',
            code: 'DUPLICATE_PHONE_IN_CSV',
            message: 'Duplicate phone number found within CSV file'
          });
          continue;
        }

        // Check duplicate with existing members in gym
        if (existingPhones.has(member.phone)) {
          errorsList.push({
            row: rowNumber,
            field: 'phone',
            code: 'DUPLICATE_PHONE_IN_GYM',
            message: 'Phone number already registered to an active member in this gym'
          });
          continue;
        }

        if (member.email) {
          if (seenFileEmails.has(member.email)) {
            errorsList.push({
              row: rowNumber,
              field: 'email',
              code: 'DUPLICATE_EMAIL_IN_CSV',
              message: 'Duplicate email address found within CSV file'
            });
            continue;
          }
          if (existingEmails.has(member.email)) {
            errorsList.push({
              row: rowNumber,
              field: 'email',
              code: 'DUPLICATE_EMAIL_IN_GYM',
              message: 'Email address already registered to an active member in this gym'
            });
            continue;
          }
        }

        // Generate monotonic member number
        const seqRes = await client.query<{ generate_next_member_number: string }>(
          'SELECT generate_next_member_number($1) as generate_next_member_number;',
          [gymId]
        );
        const memberNumber = seqRes.rows[0].generate_next_member_number;

        // Insert valid member
        await client.query(
          `INSERT INTO members (gym_id, member_number, first_name, last_name, phone, email, gender, date_of_birth, emergency_contact_name, emergency_contact_phone, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active');`,
          [
            gymId,
            memberNumber,
            member.firstName,
            member.lastName,
            member.phone,
            member.email,
            member.gender,
            member.dateOfBirth,
            member.emergencyContactName,
            member.emergencyContactPhone
          ]
        );

        seenFilePhones.add(member.phone);
        existingPhones.add(member.phone);
        if (member.email) {
          seenFileEmails.add(member.email);
          existingEmails.add(member.email);
        }
        importedCount++;
      }

      const finalStatus = importedCount > 0 ? 'completed' : (errorsList.length > 0 ? 'failed' : 'completed');

      const updateJobRes = await client.query(
        `UPDATE csv_import_jobs
         SET processed_rows = $1, error_count = $2, errors_json = $3, status = $4, completed_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *;`,
        [importedCount, errorsList.length, JSON.stringify(errorsList), finalStatus, jobId]
      );

      await client.query('COMMIT');

      const raw = updateJobRes.rows[0];
      const jobRecord = {
        id: raw.id,
        gymId: raw.gym_id,
        fileName: raw.file_name,
        fileSha256: raw.file_sha256,
        totalRows: raw.total_rows,
        processedRows: raw.processed_rows,
        errorCount: raw.error_count,
        errorsJson: typeof raw.errors_json === 'string' ? JSON.parse(raw.errors_json) : raw.errors_json,
        status: raw.status,
        createdByUserId: raw.created_by_user_id,
        createdAt: raw.created_at,
        completedAt: raw.completed_at
      };

      return reply.send({
        job: jobRecord,
        importedCount,
        errorCount: errorsList.length,
        totalRows: parsed.rows.length
      });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('uq_csv_import_file')) {
        return reply.status(409).send({ error: 'This CSV file has already been imported for this gym.' });
      }
      return reply.status(400).send({ error: msg || 'Failed to process CSV import' });
    } finally {
      client.release();
    }
  });

  // 18. List CSV import jobs for gym
  fastify.get<{
    Params: { gymId: string };
  }>('/:gymId/members/import-jobs', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const jobs = await withTenantContext(pool, { gymId, userId }, async (db) => {
      return db
        .select()
        .from(csvImportJobs)
        .where(eq(csvImportJobs.gymId, gymId))
        .orderBy(desc(csvImportJobs.createdAt));
    });
    return reply.send({ jobs });
  });

  // 19. Get single CSV import job detail
  fastify.get<{
    Params: { gymId: string; jobId: string };
  }>('/:gymId/members/import-jobs/:jobId', {
    preHandler: [authenticateUser, requireTenant]
  }, async (req, reply) => {
    const { gymId, userId } = req.tenantContext!;
    const { jobId } = req.params;
    const [job] = await withTenantContext(pool, { gymId, userId }, async (db) => {
      return db
        .select()
        .from(csvImportJobs)
        .where(and(eq(csvImportJobs.gymId, gymId), eq(csvImportJobs.id, jobId)));
    });
    if (!job) {
      return reply.status(404).send({ error: 'Import job not found' });
    }
    return reply.send({ job });
  });
};

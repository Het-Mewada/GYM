import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('Attendance Tracking API: Check-in, Overrides, Voiding & History', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91971${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91972${Math.floor(1000000 + Math.random() * 9000000)}`;
  const staffPhone = `+91973${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1OwnerToken: string;
  let gym1StaffToken: string;
  let gym1Id: string;

  let gym2OwnerToken: string;
  let gym2Id: string;

  let memberWithSubId: string;
  let memberWithoutSubId: string;
  let gym2MemberId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // 1. Setup Gym 1 Owner
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym1Phone, passHash, 'Gym 1 Owner']);
    const u1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym1Phone, password }
    });
    gym1OwnerToken = u1Login.json().accessToken;

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: { name: 'Iron Paradise Fitness', slug: `iron-fit-${Date.now()}` }
    });
    gym1Id = g1Res.json().gymId;

    // 2. Setup Gym 1 Staff
    const staffRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [staffPhone, passHash, 'Gym 1 Desk Staff']);
    const staffUserId = staffRes.rows[0].auth_register_user;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gym1Id]);
      await client.query(
        "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, 'staff', true);",
        [gym1Id, staffUserId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const staffLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: staffPhone, password }
    });
    gym1StaffToken = staffLogin.json().accessToken;

    // 3. Setup Gym 2 Owner
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym2Phone, passHash, 'Gym 2 Owner']);
    const u2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym2Phone, password }
    });
    gym2OwnerToken = u2Login.json().accessToken;

    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: { name: 'Titan Club', slug: `titan-club-${Date.now()}` }
    });
    gym2Id = g2Res.json().gymId;

    // 4. Create Members in Gym 1
    const m1Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        firstName: 'Aarav',
        lastName: 'Sharma',
        phone: '+919988112233'
      }
    });
    memberWithSubId = m1Res.json().member.id;

    const m2Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        firstName: 'Kabir',
        lastName: 'Mehta',
        phone: '+919988112244'
      }
    });
    memberWithoutSubId = m2Res.json().member.id;

    // 5. Create Member in Gym 2
    const g2mRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: {
        firstName: 'Foreign',
        lastName: 'Member',
        phone: '+919988112255'
      }
    });
    gym2MemberId = g2mRes.json().member.id;

    // 6. Create Plan and Active Subscription for Aarav (memberWithSubId)
    const planRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/plans`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        name: 'Standard Monthly',
        durationDays: 30,
        priceCents: 300000
      }
    });
    const planId = planRes.json().plan.id;

    await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/${memberWithSubId}/subscriptions`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: { planId }
    });
  });

  afterAll(async () => {
    if (gym1Id) await cleanupTenant(pool, gym1Id);
    if (gym2Id) await cleanupTenant(pool, gym2Id);
    await app.close();
  });

  let attendance1Id: string;

  it('1. records check-in successfully for member with active subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithSubId,
        method: 'staff_manual'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.attendance).toBeDefined();
    expect(body.attendance.memberId).toBe(memberWithSubId);
    expect(body.attendance.gymId).toBe(gym1Id);
    expect(body.attendance.wasOverride).toBe(false);
    expect(body.attendance.isVoided).toBe(false);

    attendance1Id = body.attendance.id;
  });

  it('2. rejects duplicate check-in on the same day (409 Conflict)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithSubId
      }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already checked in today/i);
  });

  it('3. rejects check-in when member has no active subscription (422 Unprocessable Entity)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithoutSubId
      }
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/no active subscription/i);
  });

  it('4. allows check-in with staff override when member has no active subscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithoutSubId,
        wasOverride: true,
        overrideReason: 'forgot_wallet'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.attendance.wasOverride).toBe(true);
    expect(body.attendance.overrideReason).toBe('forgot_wallet');
  });

  it('5. rejects check-in when wasOverride is true but overrideReason is missing or invalid (400 Bad Request)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithoutSubId,
        wasOverride: true
        // overrideReason intentionally omitted
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Validation failed/i);
  });

  it('6. lists gym attendance logs joined with member details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/attendance`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attendance).toBeDefined();
    expect(body.attendance.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);

    const first = body.attendance[0];
    expect(first.memberFirstName).toBeDefined();
    expect(first.memberNumber).toMatch(/^MEM-\d{5}$/);
  });

  it('7. allows owner/manager to void an attendance record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/${attendance1Id}/void`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        voidReason: 'Accidental duplicate check-in by front desk'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().message).toMatch(/voided successfully/i);
  });

  it('8. allows member to re-check-in after previous attendance was voided', async () => {
    // The previous attendance was voided in test 7.
    // The partial unique index WHERE (is_voided = false) should allow re-check-in now.
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: memberWithSubId
      }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().attendance.isVoided).toBe(false);
  });

  it('9. prevents desk staff from voiding attendance records (403 Forbidden - owner/manager only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/attendance/${attendance1Id}/void`,
      headers: { authorization: `Bearer ${gym1StaffToken}` },
      payload: {
        voidReason: 'Staff unauthorized attempt'
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Only owners and managers/i);
  });

  it('10. retrieves member attendance history and monthly summary statistics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${memberWithSubId}/attendance`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.member).toBeDefined();
    expect(body.member.firstName).toBe('Aarav');
    expect(body.summary.totalCheckIns).toBeGreaterThanOrEqual(1);
    expect(body.summary.checkInsThisMonth).toBeGreaterThanOrEqual(1);
    expect(body.attendance.length).toBeGreaterThanOrEqual(1);
  });

  it('11. enforces strict cross-tenant isolation: Gym 2 owner cannot check in Gym 1 member or void Gym 1 attendance', async () => {
    // Check-in member from Gym 1 using Gym 2 credentials
    const foreignCheckInRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/attendance/check-in`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: {
        memberId: memberWithSubId // Member belongs to Gym 1
      }
    });
    expect(foreignCheckInRes.statusCode).toBe(404);
    expect(foreignCheckInRes.json().error).toMatch(/not found in this gym/i);

    // Void Gym 1 attendance using Gym 2 credentials
    const foreignVoidRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/attendance/${attendance1Id}/void`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: {
        voidReason: 'Tampering attempt'
      }
    });
    expect(foreignVoidRes.statusCode).toBe(404);
  });
});

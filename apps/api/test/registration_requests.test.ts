import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('QR Walk-In Self-Registration & Approval Workflow', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const ownerPhone = `+91981${Math.floor(1000000 + Math.random() * 9000000)}`;
  const staffPhone = `+91982${Math.floor(1000000 + Math.random() * 9000000)}`;
  const otherOwnerPhone = `+91983${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let ownerToken: string;
  let staffToken: string;
  let otherOwnerToken: string;
  let gymId: string;
  let gymSlug: string;
  let otherGymId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // 1. Create Owner & Gym
    await pool.query('SELECT auth_register_user($1, $2, $3);', [ownerPhone, passHash, 'Primary Owner']);
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: ownerPhone, password }
    });
    ownerToken = ownerLogin.json().accessToken;

    gymSlug = `qr-gym-${Date.now()}`;
    const gymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Iron Paradise QR Gym', slug: gymSlug }
    });
    gymId = gymRes.json().gymId;

    // 2. Create Staff user linked as 'staff' in Gym
    const staffUserRes = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [staffPhone, passHash, 'Floor Staff']
    );
    const staffUserId = staffUserRes.rows[0].auth_register_user;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query(
        "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, 'staff', true);",
        [gymId, staffUserId]
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
    staffToken = staffLogin.json().accessToken;

    // 3. Create Other Gym & Owner
    await pool.query('SELECT auth_register_user($1, $2, $3);', [otherOwnerPhone, passHash, 'Other Owner']);
    const otherOwnerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: otherOwnerPhone, password }
    });
    otherOwnerToken = otherOwnerLogin.json().accessToken;

    const otherGymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${otherOwnerToken}` },
      payload: { name: 'Other Fitness Gym', slug: `other-gym-${Date.now()}` }
    });
    otherGymId = otherGymRes.json().gymId;
  });

  afterAll(async () => {
    if (gymId) await cleanupTenant(pool, gymId);
    if (otherGymId) await cleanupTenant(pool, otherGymId);
    await app.close();
  });

  it('1. Fetches public gym info by slug and by UUID (unauthenticated)', async () => {
    // By slug
    const resBySlug = await app.inject({
      method: 'GET',
      url: `/api/public/gyms/${gymSlug}/info`
    });
    expect(resBySlug.statusCode).toBe(200);
    const bodySlug = resBySlug.json();
    expect(bodySlug.name).toBe('Iron Paradise QR Gym');
    expect(bodySlug.slug).toBe(gymSlug);
    expect(bodySlug.id).toBe(gymId);

    // By UUID
    const resByUuid = await app.inject({
      method: 'GET',
      url: `/api/public/gyms/${gymId}/info`
    });
    expect(resByUuid.statusCode).toBe(200);
    const bodyUuid = resByUuid.json();
    expect(bodyUuid.name).toBe('Iron Paradise QR Gym');

    // Unknown slug returns 404
    const resNotFound = await app.inject({
      method: 'GET',
      url: '/api/public/gyms/non-existent-gym-slug/info'
    });
    expect(resNotFound.statusCode).toBe(404);
  });

  it('2. Submits a public member registration request via QR landing page', async () => {
    const applicantPhone = `+91987${Math.floor(1000000 + Math.random() * 9000000)}`;

    const res = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'Het',
        lastName: 'Mewada',
        phone: applicantPhone,
        email: 'het.qr@example.com',
        gender: 'male',
        dateOfBirth: '2000-05-15',
        notes: 'Interested in weight training'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.requestId).toBeDefined();
    expect(body.message).toContain('Iron Paradise QR Gym');
  });

  it('3. Rejects duplicate registration request with same phone number while pending', async () => {
    const applicantPhone = `+91986${Math.floor(1000000 + Math.random() * 9000000)}`;

    const res1 = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'Priya',
        phone: applicantPhone
      }
    });
    expect(res1.statusCode).toBe(201);

    // Duplicate submission
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'Priya',
        phone: applicantPhone
      }
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error).toContain('already pending review');
  });

  it('4. Owner views pending registration requests for their gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/registration-requests?status=pending`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requests.length).toBeGreaterThanOrEqual(2);
    expect(body.requests[0].status).toBe('pending');
    expect(body.requests[0].gymId).toBe(gymId);
  });

  it('5. Approves registration request: enrolls active member with monotonic MEM-xxxxx', async () => {
    const applicantPhone = `+91985${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Submit public request
    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'Rahul',
        lastName: 'Verma',
        phone: applicantPhone,
        email: 'rahul.verma@example.com',
        gender: 'male',
        dateOfBirth: '1995-10-20'
      }
    });
    const requestId = pubRes.json().requestId;

    // Owner approves request
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/registration-requests/${requestId}/approve`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(approveRes.statusCode).toBe(200);
    const approveBody = approveRes.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.memberId).toBeDefined();
    expect(approveBody.member.firstName).toBe('Rahul');
    expect(approveBody.member.lastName).toBe('Verma');
    expect(approveBody.member.phone).toBe(applicantPhone);
    expect(approveBody.member.status).toBe('active');
    expect(approveBody.member.memberNumber).toMatch(/^MEM-\d{5}$/);

    // Verify member now exists in active member directory
    const dirRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/members?q=Rahul`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(dirRes.statusCode).toBe(200);
    const dirBody = dirRes.json();
    expect(dirBody.members.some((m: { phone: string }) => m.phone === applicantPhone)).toBe(true);

    // Cannot approve twice
    const secondApprove = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/registration-requests/${requestId}/approve`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(secondApprove.statusCode).toBe(409);
  });

  it('6. Rejects registration request with reason', async () => {
    const applicantPhone = `+91984${Math.floor(1000000 + Math.random() * 9000000)}`;

    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'SpamUser',
        phone: applicantPhone
      }
    });
    const requestId = pubRes.json().requestId;

    // Owner rejects request
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/registration-requests/${requestId}/reject`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { reason: 'Incomplete or suspicious information' }
    });

    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json().success).toBe(true);

    // Verify not added to members directory
    const dirRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/members?q=SpamUser`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(dirRes.json().members.length).toBe(0);
  });

  it('7. Enforces RBAC: Staff (non-owner/non-manager) cannot approve or reject requests', async () => {
    const applicantPhone = `+91983${Math.floor(1000000 + Math.random() * 9000000)}`;

    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymSlug}/register`,
      payload: {
        firstName: 'StaffTest',
        phone: applicantPhone
      }
    });
    const requestId = pubRes.json().requestId;

    // Staff attempts to approve (Must be 403 Forbidden)
    const staffApproveRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/registration-requests/${requestId}/approve`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(staffApproveRes.statusCode).toBe(403);
    expect(staffApproveRes.json().error).toContain('Only gym owners or managers');

    // Staff attempts to reject (Must be 403 Forbidden)
    const staffRejectRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/registration-requests/${requestId}/reject`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { reason: 'Staff attempt' }
    });
    expect(staffRejectRes.statusCode).toBe(403);
  });
});

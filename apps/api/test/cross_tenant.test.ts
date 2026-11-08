import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool } from '@gym/db';
import type pg from 'pg';

describe('HTTP Cross-Tenant Security Suite (Path IDs & Body IDs)', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91911${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91922${Math.floor(1000000 + Math.random() * 9000000)}`;
  const staffPhone = `+91933${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1Token: string;
  let gym1Id: string;
  let gym1MemberId: string;

  let gym2Token: string;
  let gym2Id: string;
  let gym2MemberId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    // 1. Setup User 1 & Gym 1
    const u1Reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { phone: gym1Phone, password, fullName: 'Owner Gym 1' }
    });
    expect(u1Reg.statusCode).toBe(201);

    const u1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym1Phone, password }
    });
    gym1Token = u1Login.json().accessToken;

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { name: 'Alpha Gym', slug: `alpha-${Date.now()}` }
    });
    expect(g1Res.statusCode).toBe(201);
    gym1Id = g1Res.json().gymId;

    // Create member in Gym 1
    const m1Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { firstName: 'Alice', phone: '+919999900001' }
    });
    expect(m1Res.statusCode).toBe(201);
    gym1MemberId = m1Res.json().member.id;

    // 2. Setup User 2 & Gym 2
    const u2Reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { phone: gym2Phone, password, fullName: 'Owner Gym 2' }
    });
    expect(u2Reg.statusCode).toBe(201);

    const u2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym2Phone, password }
    });
    gym2Token = u2Login.json().accessToken;

    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { name: 'Beta Fitness', slug: `beta-${Date.now()}` }
    });
    expect(g2Res.statusCode).toBe(201);
    gym2Id = g2Res.json().gymId;

    // Create member in Gym 2
    const m2Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { firstName: 'Bob', phone: '+919999900002' }
    });
    expect(m2Res.statusCode).toBe(201);
    gym2MemberId = m2Res.json().member.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. PATH ID TAMPERING: rejects User 1 accessing Gym 2 members list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Forbidden');
  });

  it('2. PATH ID TAMPERING: rejects User 1 accessing Gym 2 member by ID via Gym 1 path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${gym2MemberId}`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Member not found');
  });

  it('3. PATH ID TAMPERING: rejects User 2 attempting to create staff invite for Gym 1', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/staff/invites`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { role: 'staff' }
    });

    expect(res.statusCode).toBe(403);
  });

  it('4. BODY ID TAMPERING: rejects payload with body gym_id differing from path gymId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        gym_id: gym2Id, // Attempted body tampering
        firstName: 'TamperMember',
        phone: '+919999900003'
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Cross-tenant violation');
  });

  it('5. BODY ID TAMPERING: rejects payload with body gymId differing from path gymId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        gymId: gym2Id, // Attempted body tampering camelCase
        firstName: 'TamperMember2',
        phone: '+919999900004'
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Cross-tenant violation');
  });

  it('6. POSITIVE ISOLATION: Gym 1 only sees Alice, Gym 2 only sees Bob', async () => {
    const g1Res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(g1Res.statusCode).toBe(200);
    const g1Members = g1Res.json().members;
    expect(g1Members.some((m: any) => m.firstName === 'Alice')).toBe(true);
    expect(g1Members.some((m: any) => m.firstName === 'Bob')).toBe(false);

    const g2Res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym2Token}` }
    });
    expect(g2Res.statusCode).toBe(200);
    const g2Members = g2Res.json().members;
    expect(g2Members.some((m: any) => m.firstName === 'Bob')).toBe(true);
    expect(g2Members.some((m: any) => m.firstName === 'Alice')).toBe(false);
  });

  it('7. STAFF INVITE WORKFLOW: owner generates invite and staff member claims it', async () => {
    // Gym 1 Owner generates invite
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/staff/invites`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { role: 'staff' }
    });
    expect(inviteRes.statusCode).toBe(201);
    const inviteCode = inviteRes.json().inviteCode;
    expect(inviteCode).toBeDefined();

    // Staff member claims invite via /api/auth/invites/claim
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/auth/invites/claim',
      payload: {
        inviteCode,
        phone: staffPhone,
        password: 'StaffPassword123!',
        fullName: 'Gym 1 Staff'
      }
    });
    expect(claimRes.statusCode).toBe(200);
    const staffToken = claimRes.json().accessToken;
    expect(staffToken).toBeDefined();

    // Staff member can now access Gym 1 members
    const staffListRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(staffListRes.statusCode).toBe(200);

    // Staff member cannot access Gym 2
    const staffCrossRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(staffCrossRes.statusCode).toBe(403);
  });
});

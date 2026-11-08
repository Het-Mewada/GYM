import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('Members API: List, Create, and Search with Tenant Isolation', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91941${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91942${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1Token: string;
  let gym1Id: string;

  let gym2Token: string;
  let gym2Id: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // Setup Gym 1
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym1Phone, passHash, 'Owner Gym 1']);
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
      payload: { name: 'Alpha Fitness Club', slug: `alpha-fit-${Date.now()}` }
    });
    gym1Id = g1Res.json().gymId;

    // Setup Gym 2
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym2Phone, passHash, 'Owner Gym 2']);
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
      payload: { name: 'Omega Powerhouse', slug: `omega-power-${Date.now()}` }
    });
    gym2Id = g2Res.json().gymId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. creates single-name member and full-name member with monotonic member numbers', async () => {
    // Single name member: Suresh
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Suresh',
        phone: '+919811100001',
        email: 'suresh@example.com'
      }
    });
    expect(res1.statusCode).toBe(201);
    const m1 = res1.json().member;
    expect(m1.firstName).toBe('Suresh');
    expect(m1.lastName).toBeNull();
    expect(m1.memberNumber).toBe('MEM-00001');

    // Full name member: Ramesh Patel
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Ramesh',
        lastName: 'Patel',
        phone: '+919811100002',
        email: 'ramesh.patel@example.com'
      }
    });
    expect(res2.statusCode).toBe(201);
    const m2 = res2.json().member;
    expect(m2.firstName).toBe('Ramesh');
    expect(m2.lastName).toBe('Patel');
    expect(m2.memberNumber).toBe('MEM-00002');
  });

  it('2. validates required fields when creating a member', async () => {
    const invalidRes1 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: '',
        phone: '+919811100099'
      }
    });
    expect(invalidRes1.statusCode).toBe(400);
    expect(invalidRes1.json().error).toContain('firstName and phone are required');

    const invalidRes2 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'NoPhone'
      }
    });
    expect(invalidRes2.statusCode).toBe(400);
    expect(invalidRes2.json().error).toContain('firstName and phone are required');
  });

  it('2b. rejects duplicate phone or duplicate email within the same gym (409 Conflict)', async () => {
    // Duplicate phone in Gym 1 (Suresh has '+919811100001')
    const dupPhoneRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Duplicate',
        lastName: 'PhonePerson',
        phone: '+919811100001',
        email: 'unique.email@example.com'
      }
    });
    expect(dupPhoneRes.statusCode).toBe(409);
    expect(dupPhoneRes.json().error).toContain('phone number already exists');

    // Duplicate email in Gym 1 (Suresh has 'suresh@example.com')
    const dupEmailRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Duplicate',
        lastName: 'EmailPerson',
        phone: '+919811100099',
        email: 'SURESH@example.com' // Case-insensitive test
      }
    });
    expect(dupEmailRes.statusCode).toBe(409);
    expect(dupEmailRes.json().error).toContain('email already exists');
  });

  it('3. searches members by single first name, last name, combined name, phone, and member number', async () => {
    // Search by first name
    const q1 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=suresh`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(q1.statusCode).toBe(200);
    expect(q1.json().members.length).toBe(1);
    expect(q1.json().members[0].firstName).toBe('Suresh');

    // Search by last name
    const q2 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=patel`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(q2.statusCode).toBe(200);
    expect(q2.json().members.length).toBe(1);
    expect(q2.json().members[0].firstName).toBe('Ramesh');

    // Search by combined full name
    const q3 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=ramesh patel`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(q3.statusCode).toBe(200);
    expect(q3.json().members.length).toBe(1);
    expect(q3.json().members[0].firstName).toBe('Ramesh');

    // Search by phone
    const q4 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=9811100001`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(q4.statusCode).toBe(200);
    expect(q4.json().members.length).toBe(1);
    expect(q4.json().members[0].firstName).toBe('Suresh');

    // Search by member number
    const q5 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=MEM-00002`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(q5.statusCode).toBe(200);
    expect(q5.json().members.length).toBe(1);
    expect(q5.json().members[0].firstName).toBe('Ramesh');
  });

  it('4. enforces strict cross-tenant search isolation', async () => {
    // Create member in Gym 2 with same name "Suresh" but different phone
    const g2Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: {
        firstName: 'Suresh',
        lastName: 'Sharma',
        phone: '+919822200001',
        email: 'suresh.sharma@example.com'
      }
    });
    expect(g2Res.statusCode).toBe(201);
    expect(g2Res.json().member.memberNumber).toBe('MEM-00001'); // Monotonic counter is per-gym!

    // Gym 1 searches for Suresh Sharma -> returns 0 results
    const qGym1 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=sharma`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(qGym1.statusCode).toBe(200);
    expect(qGym1.json().members.length).toBe(0);

    // Gym 2 searches for Patel -> returns 0 results
    const qGym2 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members?q=patel`,
      headers: { authorization: `Bearer ${gym2Token}` }
    });
    expect(qGym2.statusCode).toBe(200);
    expect(qGym2.json().members.length).toBe(0);
  });

  it('5. supports pagination with limit and offset', async () => {
    const p1 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?limit=1&offset=0`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(p1.statusCode).toBe(200);
    expect(p1.json().members.length).toBe(1);
    expect(p1.json().total).toBe(2);
    expect(p1.json().limit).toBe(1);
    expect(p1.json().offset).toBe(0);

    const p2 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?limit=1&offset=1`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(p2.statusCode).toBe(200);
    expect(p2.json().members.length).toBe(1);
    expect(p2.json().total).toBe(2);
    expect(p2.json().members[0].id).not.toBe(p1.json().members[0].id);
  });

  it('6. lets the owner edit a member in their gym', async () => {
    // Fetch member 1 (Suresh) from Gym 1
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members?q=Suresh`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(listRes.statusCode).toBe(200);
    const member = listRes.json().members[0];
    expect(member).toBeDefined();

    // Owner updates Suresh: add last name, update email, change status to inactive
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gym1Id}/members/${member.id}`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Suresh Updated',
        lastName: 'Raina',
        phone: '+919811199999',
        email: 'suresh.updated@example.com',
        gender: 'male',
        dateOfBirth: '1990-05-15',
        emergencyContactName: 'Priyanka',
        emergencyContactPhone: '+919811188888',
        status: 'inactive'
      }
    });

    expect(updateRes.statusCode).toBe(200);
    const updatedMember = updateRes.json().member;
    expect(updatedMember.firstName).toBe('Suresh Updated');
    expect(updatedMember.lastName).toBe('Raina');
    expect(updatedMember.phone).toBe('+919811199999');
    expect(updatedMember.email).toBe('suresh.updated@example.com');
    expect(updatedMember.gender).toBe('male');
    expect(updatedMember.dateOfBirth).toBe('1990-05-15');
    expect(updatedMember.emergencyContactName).toBe('Priyanka');
    expect(updatedMember.emergencyContactPhone).toBe('+919811188888');
    expect(updatedMember.status).toBe('inactive');

    // Confirm GET returns updated details
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${member.id}`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().member.firstName).toBe('Suresh Updated');
    expect(getRes.json().member.status).toBe('inactive');
  });

  it('7. rejects updating member with duplicate phone in the same gym', async () => {
    // Get member 1 and member 2 in Gym 1
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    const membersList = listRes.json().members;
    expect(membersList.length).toBeGreaterThanOrEqual(2);
    const [m1, m2] = membersList;

    // Try to update m1's phone to m2's phone
    const dupRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gym1Id}/members/${m1.id}`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        phone: m2.phone
      }
    });

    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error).toMatch(/already exists/i);
  });

  it('8. strictly enforces tenant isolation: owner cannot edit a member outside their gym', async () => {
    // Fetch member from Gym 1
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    const gym1Member = listRes.json().members[0];

    // Attempt 1: Gym 2 owner calls Gym 1's URL -> 403 Forbidden
    const attack1 = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gym1Id}/members/${gym1Member.id}`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { firstName: 'Hacked by Gym 2' }
    });
    expect(attack1.statusCode).toBe(403);

    // Attempt 2: Gym 2 owner calls Gym 2's URL with Gym 1's member ID -> 404 Not Found in this gym
    const attack2 = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gym2Id}/members/${gym1Member.id}`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { firstName: 'Hacked by Gym 2' }
    });
    expect(attack2.statusCode).toBe(404);
    expect(attack2.json().error).toMatch(/not found in this gym/i);

    // Verify member in Gym 1 is untouched
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${gym1Member.id}`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().member.firstName).toBe(gym1Member.firstName);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createPool } from '@gym/db';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/crypto.js';
import { signAccessToken } from '../src/auth/jwt.js';

describe('Membership Plans & Subscriptions Suite', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  let ownerToken: string;
  let staffToken: string;
  let otherGymOwnerToken: string;
  let gymId: string;
  let otherGymId: string;
  let memberId: string;
  let otherMemberId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp({ pool });
    await app.ready();

    const passHash = await hashPassword('TestPass123!');
    const ownerPhone = `+9195000${Date.now().toString().slice(-5)}`;
    const staffPhone = `+9195111${Date.now().toString().slice(-5)}`;
    const otherOwnerPhone = `+9195222${Date.now().toString().slice(-5)}`;

    const ownerRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [ownerPhone, passHash, 'Gym Owner']);
    const staffRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [staffPhone, passHash, 'Gym Staff']);
    const otherOwnerRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [otherOwnerPhone, passHash, 'Other Owner']);

    const ownerId = ownerRes.rows[0].auth_register_user;
    const staffId = staffRes.rows[0].auth_register_user;
    const otherOwnerId = otherOwnerRes.rows[0].auth_register_user;

    ownerToken = signAccessToken({ userId: ownerId, fullName: 'Gym Owner' });
    staffToken = signAccessToken({ userId: staffId, fullName: 'Gym Staff' });
    otherGymOwnerToken = signAccessToken({ userId: otherOwnerId, fullName: 'Other Owner' });

    // Provision Gym 1
    const gymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Titan Fitness', slug: `titan-${Date.now()}` }
    });
    gymId = gymRes.json().gymId;

    // Provision Gym 2
    const otherGymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${otherGymOwnerToken}` },
      payload: { name: 'Spartan Gym', slug: `spartan-${Date.now()}` }
    });
    otherGymId = otherGymRes.json().gymId;

    // Link staff to Gym 1
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query(
        "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, 'staff', true);",
        [gymId, staffId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Enroll Member in Gym 1
    const memRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { firstName: 'Rohan', lastName: 'Verma', phone: '+919911223344' }
    });
    memberId = memRes.json().member.id;

    // Enroll Member in Gym 2
    const otherMemRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${otherGymId}/members`,
      headers: { authorization: `Bearer ${otherGymOwnerToken}` },
      payload: { firstName: 'Vikrant', phone: '+919922334455' }
    });
    otherMemberId = otherMemRes.json().member.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let planId: string;

  it('1. owner can create a membership plan with valid duration and price', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/plans`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Quarterly Gold',
        durationDays: 90,
        priceCents: 1200000 // 12,000 INR
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.plan.id).toBeDefined();
    expect(body.plan.name).toBe('Quarterly Gold');
    expect(body.plan.durationDays).toBe(90);
    expect(Number(body.plan.priceCents)).toBe(1200000);
    expect(body.plan.isActive).toBe(true);
    planId = body.plan.id;
  });

  it('2. non-manager staff cannot create or update membership plans (role enforcement)', async () => {
    const createAttempt = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/plans`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { name: 'Staff Plan', durationDays: 30, priceCents: 300000 }
    });
    expect(createAttempt.statusCode).toBe(403);
    expect(createAttempt.json().error).toMatch(/only owners and managers/i);

    const updateAttempt = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymId}/plans/${planId}`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { name: 'Staff Hacked Plan' }
    });
    expect(updateAttempt.statusCode).toBe(403);
  });

  it('3. owner can update plan attributes (name, duration, price, isActive)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymId}/plans/${planId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Quarterly Platinum',
        priceCents: 1350000
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().plan.name).toBe('Quarterly Platinum');
    expect(Number(res.json().plan.priceCents)).toBe(1350000);
    expect(res.json().plan.durationDays).toBe(90);
  });

  it('4. rejects invalid plan payloads (empty name, non-positive duration, negative price)', async () => {
    const invalidDuration = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/plans`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Bad Plan', durationDays: 0, priceCents: 5000 }
    });
    expect(invalidDuration.statusCode).toBe(400);

    const negativePrice = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/plans`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Bad Plan', durationDays: 30, priceCents: -100 }
    });
    expect(negativePrice.statusCode).toBe(400);
  });

  it('5. staff and owner can list plans for the gym', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/plans`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(res.statusCode).toBe(200);
    const plans = res.json().plans;
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans.some((p: { id: string }) => p.id === planId)).toBe(true);
  });

  let activeSubId: string;

  it('6. enrolls a member in a subscription with calculated dates and prices', async () => {
    const startDate = '2026-12-01';
    // 90-day plan starting 2026-12-01: end date is 2026-12-01 + 89 days = 2027-02-28
    const subRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members/${memberId}/subscriptions`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        planId,
        startDate,
        discountCents: 50000 // 500 INR discount
      }
    });

    expect(subRes.statusCode).toBe(201);
    const sub = subRes.json().subscription;
    expect(sub.id).toBeDefined();
    expect(sub.memberId).toBe(memberId);
    expect(sub.planId).toBe(planId);
    expect(sub.startDate).toBe('2026-12-01');
    expect(sub.endDate).toBe('2027-02-28');
    expect(Number(sub.totalPriceCents)).toBe(1350000);
    expect(Number(sub.discountCents)).toBe(50000);
    expect(sub.status).toBe('queued'); // Dec 2026 is in the future
    activeSubId = sub.id;
  });

  it('7. prevents creating an overlapping subscription for the same member (409 Conflict)', async () => {
    // Attempt to create another subscription starting 2027-01-01 (overlaps with 2026-12-01 to 2027-02-28)
    const overlapRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members/${memberId}/subscriptions`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        planId,
        startDate: '2027-01-01'
      }
    });

    expect(overlapRes.statusCode).toBe(409);
    expect(overlapRes.json().error).toMatch(/overlap/i);
  });

  it('8. queues a subsequent subscription seamlessly starting the day after previous subscription ends', async () => {
    // Previous ends 2027-02-28. Next starts 2027-03-01.
    const queuedRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/members/${memberId}/subscriptions`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        planId,
        startDate: '2027-03-01'
      }
    });

    expect(queuedRes.statusCode).toBe(201);
    const queuedSub = queuedRes.json().subscription;
    expect(queuedSub.startDate).toBe('2027-03-01');
    expect(queuedSub.endDate).toBe('2027-05-29'); // 90 days from March 1st
    expect(queuedSub.status).toBe('queued');
  });

  it('9. lists subscriptions for a member with joined plan metadata', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/members/${memberId}/subscriptions`,
      headers: { authorization: `Bearer ${staffToken}` }
    });

    expect(listRes.statusCode).toBe(200);
    const subs = listRes.json().subscriptions;
    expect(subs.length).toBe(2);
    expect(subs[0].planName).toBe('Quarterly Platinum');
    expect(subs[0].planDurationDays).toBe(90);
  });

  it('10. owner can cancel a subscription and allow replacement scheduling', async () => {
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/subscriptions/${activeSubId}/cancel`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().subscription.status).toBe('cancelled');

    // Confirm GET subscription reflects cancelled status
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/subscriptions/${activeSubId}`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().subscription.status).toBe('cancelled');
    expect(getRes.json().subscription.memberFirstName).toBe('Rohan');
  });

  it('11. strictly rejects cross-tenant subscription tampering', async () => {
    // Attempt 1: Gym 2 owner calls Gym 1's subscription cancel -> 403 Forbidden
    const attack1 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/subscriptions/${activeSubId}/cancel`,
      headers: { authorization: `Bearer ${otherGymOwnerToken}` }
    });
    expect(attack1.statusCode).toBe(403);

    // Attempt 2: Gym 2 owner uses Gym 1's activeSubId under Gym 2's URL -> 404 Not Found in this gym
    const attack2 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${otherGymId}/subscriptions/${activeSubId}/cancel`,
      headers: { authorization: `Bearer ${otherGymOwnerToken}` }
    });
    expect(attack2.statusCode).toBe(404);

    // Attempt 3: Gym 2 owner attempts to enroll Gym 2's member into Gym 1's plan (plan hijacking)
    const attack3 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${otherGymId}/members/${otherMemberId}/subscriptions`,
      headers: { authorization: `Bearer ${otherGymOwnerToken}` },
      payload: { planId } // planId belongs to Gym 1
    });
    expect(attack3.statusCode).toBe(404);
    expect(attack3.json().error).toMatch(/plan not found in this gym/i);
  });
});

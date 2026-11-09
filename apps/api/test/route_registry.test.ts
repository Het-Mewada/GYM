import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
import type pg from 'pg';
import { createPool, cleanupTenant } from '@gym/db';
import { buildApp } from '../src/app.js';
import { hashPassword, generateRandomToken, hashToken } from '../src/auth/crypto.js';
import { signAccessToken } from '../src/auth/jwt.js';

interface RouteDeclaration {
  method: string;
  url: string;
  isTenantScoped: boolean;
  hasPathIsolationTest?: boolean;
  hasBodyIsolationTest?: boolean;
  hasResourceIdIsolationTest?: boolean;
  notes?: string;
}

// DECLARATIVE ROUTE REGISTRY
// Every single route registered in Fastify must have an entry here or the build fails.
const ROUTE_REGISTRY: RouteDeclaration[] = [
  // 1. System & Auth (Non-tenant / pre-tenant)
  { method: 'OPTIONS', url: '*', isTenantScoped: false, notes: 'Global CORS preflight handler' },
  { method: 'GET', url: '/health', isTenantScoped: false, notes: 'Public health probe' },
  { method: 'POST', url: '/api/auth/register', isTenantScoped: false, notes: 'Public user registration' },
  { method: 'POST', url: '/api/auth/login', isTenantScoped: false, notes: 'Public authentication' },
  { method: 'POST', url: '/api/auth/refresh', isTenantScoped: false, notes: 'Session refresh token rotation' },
  { method: 'POST', url: '/api/auth/logout', isTenantScoped: false, notes: 'Session termination' },
  { method: 'POST', url: '/api/auth/invites/claim', isTenantScoped: false, notes: 'Staff invitation claim' },
  { method: 'POST', url: '/api/auth/password-reset/request', isTenantScoped: false, notes: 'Password reset request' },
  { method: 'POST', url: '/api/auth/password-reset/complete', isTenantScoped: false, notes: 'Password reset completion' },
  { method: 'POST', url: '/api/auth/switch-gym', isTenantScoped: false, notes: 'Tenant session switch with credential re-verification' },
  { method: 'POST', url: '/api/gyms', isTenantScoped: false, notes: 'User-scoped gym provisioning' },
  { method: 'GET', url: '/api/gyms', isTenantScoped: false, notes: 'List gyms (platform admin gets all; users get memberships)' },
  { method: 'GET', url: '/api/public/gyms/:gymSlugOrId/info', isTenantScoped: false, notes: 'Public gym details for QR landing' },
  { method: 'POST', url: '/api/public/gyms/:gymSlugOrId/register', isTenantScoped: false, notes: 'Public member self-registration request' },

  // 2. Tenant-Scoped Resource Routes (Must have isolation tests)
  {
    method: 'GET',
    url: '/api/gyms/:gymId/members',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    notes: 'List gym members'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/members',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    notes: 'Create gym member'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/members/:memberId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get gym member by ID'
  },
  {
    method: 'PATCH',
    url: '/api/gyms/:gymId/members/:memberId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Update gym member profile'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/staff/invites',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    notes: 'Create staff invitation'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/staff/:userId/reset-password',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Owner-initiated reset for staff user'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/plans',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    notes: 'List membership plans'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/plans',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    notes: 'Create membership plan'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/plans/:planId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get membership plan'
  },
  {
    method: 'PATCH',
    url: '/api/gyms/:gymId/plans/:planId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Update membership plan'
  },
  {
    method: 'DELETE',
    url: '/api/gyms/:gymId/plans/:planId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Delete membership plan'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/members/:memberId/subscriptions',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'List member subscriptions'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/members/:memberId/subscriptions',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Create subscription for member'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/subscriptions/:subscriptionId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get subscription details'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/subscriptions/:subscriptionId/cancel',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Cancel subscription'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/payments',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    notes: 'List gym payments'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/payments',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    notes: 'Record payment transaction'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/payments/:paymentId',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get payment receipt'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/payments/:paymentId/refund',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Refund payment transaction'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/members/:memberId/financials',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get member financial summary'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/attendance/check-in',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Member attendance check-in'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/attendance/:attendanceId/void',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Void attendance record'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/attendance',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: false,
    notes: 'List gym attendance logs'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/members/:memberId/attendance',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Get member attendance logs'
  },
  {
    method: 'GET',
    url: '/api/gyms/:gymId/registration-requests',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: false,
    notes: 'List member registration requests'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/registration-requests/:requestId/approve',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: false,
    hasResourceIdIsolationTest: true,
    notes: 'Approve member registration request'
  },
  {
    method: 'POST',
    url: '/api/gyms/:gymId/registration-requests/:requestId/reject',
    isTenantScoped: true,
    hasPathIsolationTest: true,
    hasBodyIsolationTest: true,
    hasResourceIdIsolationTest: true,
    notes: 'Reject member registration request'
  }
];

describe('Route Registry & Cross-Tenant Isolation Enforcement', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  const registeredRoutes: Array<{ method: string; url: string }> = [];

  let ownerAToken: string;
  let ownerBToken: string;
  let gymAId: string;
  let gymBId: string;
  let memberAId: string;
  let memberBId: string;
  let staffAId: string;
  let staffBId: string;
  let planAId: string;
  let planBId: string;
  let subAId: string;
  let subBId: string;
  let paymentAId: string;
  let paymentBId: string;
  let attendanceAId: string;
  let attendanceBId: string;
  let requestAId: string;
  let requestBId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp({
      pool,
      onRoute: (route: RouteOptions) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const m of methods) {
          if (m !== 'HEAD') { // ignore auto-generated HEAD
            registeredRoutes.push({ method: m, url: route.url });
          }
        }
      }
    });

    await app.ready();

    // Setup Test Tenancies
    const passHash = await hashPassword('SecurePassword123!');
    const phoneA = `+9199999${Date.now().toString().slice(-5)}`;
    const phoneB = `+9188888${Date.now().toString().slice(-5)}`;

    const userARes = await pool.query('SELECT auth_register_user($1, $2, $3);', [phoneA, passHash, 'Owner A']);
    const userBRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [phoneB, passHash, 'Owner B']);
    const userAId = userARes.rows[0].auth_register_user;
    const userBId = userBRes.rows[0].auth_register_user;

    ownerAToken = signAccessToken({ userId: userAId, fullName: 'Owner A' });
    ownerBToken = signAccessToken({ userId: userBId, fullName: 'Owner B' });

    // Provision Gym A & Gym B using API
    const gymARes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Gym Alpha', slug: `gym-alpha-${Date.now()}` }
    });
    gymAId = JSON.parse(gymARes.payload).gymId;

    const gymBRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { name: 'Gym Beta', slug: `gym-beta-${Date.now()}` }
    });
    gymBId = JSON.parse(gymBRes.payload).gymId;

    // Create Member in Gym A
    const memARes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'Alice', phone: '+919111111111' }
    });
    memberAId = JSON.parse(memARes.payload).member.id;

    // Create Member in Gym B
    const memBRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymBId}/members`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { firstName: 'Bob', phone: '+919222222222' }
    });
    memberBId = JSON.parse(memBRes.payload).member.id;

    // Create Staff in Gym A and Staff in Gym B
    const staffPhoneA = `+9177771${Date.now().toString().slice(-5)}`;
    const staffPhoneB = `+9177772${Date.now().toString().slice(-5)}`;
    const staffARes = await pool.query('SELECT auth_register_user($1, $2, $3);', [staffPhoneA, passHash, 'Staff A']);
    const staffBRes = await pool.query('SELECT auth_register_user($1, $2, $3);', [staffPhoneB, passHash, 'Staff B']);
    staffAId = staffARes.rows[0].auth_register_user;
    staffBId = staffBRes.rows[0].auth_register_user;

    const linkStaff = async (gId: string, uId: string) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.gym_id', $1, true);", [gId]);
        await client.query(
          "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, 'staff', true);",
          [gId, uId]
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    };

    await linkStaff(gymAId, staffAId);
    await linkStaff(gymBId, staffBId);

    // Create Plans in Gym A and Gym B
    const planARes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/plans`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Alpha Monthly', durationDays: 30, priceCents: 500000 }
    });
    planAId = JSON.parse(planARes.payload).plan.id;

    const planBRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymBId}/plans`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { name: 'Beta Monthly', durationDays: 30, priceCents: 600000 }
    });
    planBId = JSON.parse(planBRes.payload).plan.id;

    // Create Subscriptions in Gym A and Gym B
    const subARes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members/${memberAId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { planId: planAId }
    });
    subAId = JSON.parse(subARes.payload).subscription.id;

    const subBRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymBId}/members/${memberBId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { planId: planBId }
    });
    subBId = JSON.parse(subBRes.payload).subscription.id;

    // Create Payments in Gym A and Gym B
    const payARes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        memberId: memberAId,
        subscriptionId: subAId,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 500000,
        method: 'upi'
      }
    });
    paymentAId = JSON.parse(payARes.payload).payment.id;

    const payBRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymBId}/payments`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: {
        memberId: memberBId,
        subscriptionId: subBId,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 600000,
        method: 'cash'
      }
    });
    paymentBId = JSON.parse(payBRes.payload).payment.id;

    // Create Attendance in Gym A and Gym B
    const attARes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/check-in`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { memberId: memberAId }
    });
    attendanceAId = JSON.parse(attARes.payload).attendance.id;

    const attBRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymBId}/attendance/check-in`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { memberId: memberBId }
    });
    attendanceBId = JSON.parse(attBRes.payload).attendance.id;

    // Create Registration Requests in Gym A and Gym B
    const regReqARes = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymAId}/register`,
      payload: { firstName: 'RegAlice', phone: '+919444444441' }
    });
    requestAId = JSON.parse(regReqARes.payload).requestId;

    const regReqBRes = await app.inject({
      method: 'POST',
      url: `/api/public/gyms/${gymBId}/register`,
      payload: { firstName: 'RegBob', phone: '+919444444442' }
    });
    requestBId = JSON.parse(regReqBRes.payload).requestId;
  });

  afterAll(async () => {
    if (gymAId) await cleanupTenant(pool, gymAId);
    if (gymBId) await cleanupTenant(pool, gymBId);
    await app.close();
  });

  it('fails build if any registered Fastify route is missing from ROUTE_REGISTRY', () => {
    for (const registered of registeredRoutes) {
      const match = ROUTE_REGISTRY.find(
        (r) => r.method === registered.method && r.url === registered.url
      );

      expect(
        match,
        `SECURITY VIOLATION: Route [${registered.method}] ${registered.url} is registered in Fastify but has NO entry in ROUTE_REGISTRY! All routes must declare their tenant isolation requirements.`
      ).toBeDefined();
    }
  });

  it('enforces that every tenant-scoped route has active cross-tenant isolation tests', () => {
    const tenantRoutes = ROUTE_REGISTRY.filter((r) => r.isTenantScoped);
    expect(tenantRoutes.length).toBeGreaterThan(0);

    for (const r of tenantRoutes) {
      expect(
        r.hasPathIsolationTest,
        `Route [${r.method}] ${r.url} must declare and pass path isolation tests.`
      ).toBe(true);
    }
  });

  // Dynamic Verification of Path Isolation for all tenant-scoped routes
  it('rejects path-tampered requests (calling Gym A route with Owner B credentials)', async () => {
    // 1. GET /api/gyms/:gymId/members
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listRes.statusCode).toBe(403);

    // 2. POST /api/gyms/:gymId/members
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { firstName: 'Intruder', phone: '+919333333333' }
    });
    expect(createRes.statusCode).toBe(403);

    // 3. GET /api/gyms/:gymId/members/:memberId
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(getRes.statusCode).toBe(403);

    // 3b. PATCH /api/gyms/:gymId/members/:memberId
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/members/${memberAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { firstName: 'Intruder Update' }
    });
    expect(patchRes.statusCode).toBe(403);

    // 4. POST /api/gyms/:gymId/staff/invites
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/staff/invites`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { role: 'staff' }
    });
    expect(inviteRes.statusCode).toBe(403);

    // 5. POST /api/gyms/:gymId/staff/:userId/reset-password
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/staff/${staffAId}/reset-password`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(resetRes.statusCode).toBe(403);

    // 6. GET /api/gyms/:gymId/plans
    const listPlansRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/plans`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listPlansRes.statusCode).toBe(403);

    // 7. POST /api/gyms/:gymId/plans
    const createPlanRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/plans`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { name: 'Intruder Plan', durationDays: 30, priceCents: 1000 }
    });
    expect(createPlanRes.statusCode).toBe(403);

    // 8. GET /api/gyms/:gymId/plans/:planId
    const getPlanRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/plans/${planAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(getPlanRes.statusCode).toBe(403);

    // 9. PATCH /api/gyms/:gymId/plans/:planId
    const patchPlanRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/plans/${planAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { name: 'Hacked Plan' }
    });
    expect(patchPlanRes.statusCode).toBe(403);

    // 9b. DELETE /api/gyms/:gymId/plans/:planId
    const deletePlanRes = await app.inject({
      method: 'DELETE',
      url: `/api/gyms/${gymAId}/plans/${planAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(deletePlanRes.statusCode).toBe(403);

    // 10. GET /api/gyms/:gymId/members/:memberId/subscriptions
    const listSubsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberAId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listSubsRes.statusCode).toBe(403);

    // 11. POST /api/gyms/:gymId/members/:memberId/subscriptions
    const createSubRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members/${memberAId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { planId: planAId }
    });
    expect(createSubRes.statusCode).toBe(403);

    // 12. GET /api/gyms/:gymId/subscriptions/:subscriptionId
    const getSubRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/subscriptions/${subAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(getSubRes.statusCode).toBe(403);

    // 13. POST /api/gyms/:gymId/subscriptions/:subscriptionId/cancel
    const cancelSubRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/subscriptions/${subAId}/cancel`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(cancelSubRes.statusCode).toBe(403);

    // 14. GET /api/gyms/:gymId/payments
    const listPaymentsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/payments`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listPaymentsRes.statusCode).toBe(403);

    // 15. POST /api/gyms/:gymId/payments
    const createPaymentRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: {
        memberId: memberAId,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 1000,
        method: 'upi'
      }
    });
    expect(createPaymentRes.statusCode).toBe(403);

    // 16. GET /api/gyms/:gymId/payments/:paymentId
    const getPaymentRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/payments/${paymentAId}`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(getPaymentRes.statusCode).toBe(403);

    // 17. POST /api/gyms/:gymId/payments/:paymentId/refund
    const refundRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments/${paymentAId}/refund`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 500
      }
    });
    expect(refundRes.statusCode).toBe(403);

    // 18. GET /api/gyms/:gymId/members/:memberId/financials
    const financialsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberAId}/financials`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(financialsRes.statusCode).toBe(403);

    // 19. POST /api/gyms/:gymId/attendance/check-in
    const checkInPathRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/check-in`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { memberId: memberAId }
    });
    expect(checkInPathRes.statusCode).toBe(403);

    // 20. POST /api/gyms/:gymId/attendance/:attendanceId/void
    const voidPathRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/${attendanceAId}/void`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { voidReason: 'Cross tenant test' }
    });
    expect(voidPathRes.statusCode).toBe(403);

    // 21. GET /api/gyms/:gymId/attendance
    const listAttPathRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/attendance`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listAttPathRes.statusCode).toBe(403);

    // 22. GET /api/gyms/:gymId/members/:memberId/attendance
    const memberAttPathRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberAId}/attendance`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(memberAttPathRes.statusCode).toBe(403);

    // 23. GET /api/gyms/:gymId/registration-requests
    const listReqPathRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/registration-requests`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(listReqPathRes.statusCode).toBe(403);

    // 24. POST /api/gyms/:gymId/registration-requests/:requestId/approve
    const approveReqPathRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/registration-requests/${requestAId}/approve`,
      headers: { authorization: `Bearer ${ownerBToken}` }
    });
    expect(approveReqPathRes.statusCode).toBe(403);

    // 25. POST /api/gyms/:gymId/registration-requests/:requestId/reject
    const rejectReqPathRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/registration-requests/${requestAId}/reject`,
      headers: { authorization: `Bearer ${ownerBToken}` },
      payload: { reason: 'Cross-tenant path attempt' }
    });
    expect(rejectReqPathRes.statusCode).toBe(403);
  });

  // Verification of Body Isolation (Payload injection with foreign gym ID)
  it('rejects body-tampered requests where body gymId points to another tenant', async () => {
    // POST /api/gyms/:gymId/members with body gymId = gymBId
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'Alice 2', phone: '+919444444444', gymId: gymBId }
    });
    expect(createRes.statusCode).toBe(403);
    expect(JSON.parse(createRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/staff/invites with body gym_id = gymBId
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/staff/invites`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { role: 'staff', gym_id: gymBId }
    });
    expect(inviteRes.statusCode).toBe(403);
    expect(JSON.parse(inviteRes.payload).error).toMatch(/Cross-tenant violation/i);

    // PATCH /api/gyms/:gymId/members/:memberId with body gymId = gymBId
    const patchBodyRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/members/${memberAId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'Alice Patched', gymId: gymBId }
    });
    expect(patchBodyRes.statusCode).toBe(403);
    expect(JSON.parse(patchBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/plans with body gymId = gymBId
    const planBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/plans`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Alpha 2', durationDays: 30, priceCents: 5000, gymId: gymBId }
    });
    expect(planBodyRes.statusCode).toBe(403);
    expect(JSON.parse(planBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // PATCH /api/gyms/:gymId/plans/:planId with body gymId = gymBId
    const patchPlanBodyRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/plans/${planAId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Alpha Patched', gymId: gymBId }
    });
    expect(patchPlanBodyRes.statusCode).toBe(403);
    expect(JSON.parse(patchPlanBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/members/:memberId/subscriptions with body gymId = gymBId
    const subBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members/${memberAId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { planId: planAId, gymId: gymBId }
    });
    expect(subBodyRes.statusCode).toBe(403);
    expect(JSON.parse(subBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/subscriptions/:subscriptionId/cancel with body gymId = gymBId
    const cancelBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/subscriptions/${subAId}/cancel`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { gymId: gymBId }
    });
    expect(cancelBodyRes.statusCode).toBe(403);
    expect(JSON.parse(cancelBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/payments with body gymId = gymBId
    const payBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        memberId: memberAId,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 1000,
        method: 'upi',
        gymId: gymBId
      }
    });
    expect(payBodyRes.statusCode).toBe(403);
    expect(JSON.parse(payBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/payments/:paymentId/refund with body gymId = gymBId
    const refundBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments/${paymentAId}/refund`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 500,
        gymId: gymBId
      }
    });
    expect(refundBodyRes.statusCode).toBe(403);
    expect(JSON.parse(refundBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/attendance/check-in with body gymId = gymBId
    const checkInBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/check-in`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        memberId: memberAId,
        gymId: gymBId
      }
    });
    expect(checkInBodyRes.statusCode).toBe(403);
    expect(JSON.parse(checkInBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/attendance/:attendanceId/void with body gymId = gymBId
    const voidBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/${attendanceAId}/void`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        voidReason: 'Cross tenant body injection test',
        gymId: gymBId
      }
    });
    expect(voidBodyRes.statusCode).toBe(403);
    expect(JSON.parse(voidBodyRes.payload).error).toMatch(/Cross-tenant violation/i);

    // POST /api/gyms/:gymId/registration-requests/:requestId/reject with body gymId = gymBId
    const rejectBodyRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/registration-requests/${requestAId}/reject`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        reason: 'Cross tenant body injection test',
        gymId: gymBId
      }
    });
    expect(rejectBodyRes.statusCode).toBe(403);
    expect(JSON.parse(rejectBodyRes.payload).error).toMatch(/Cross-tenant violation/i);
  });

  // Verification of Resource-ID Cross-Tenant Isolation
  it('rejects resource-ID cross-tenant access (requesting Member B ID through Gym A URL)', async () => {
    // GET /api/gyms/:gymId/members/:memberId where member belongs to Gym B, but queried under Gym A
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getRes.statusCode).toBe(404);
    expect(JSON.parse(getRes.payload).error).toMatch(/not found in this gym/i);

    // PATCH /api/gyms/:gymId/members/:memberId where member belongs to Gym B, but edited under Gym A
    const patchResIdRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/members/${memberBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { firstName: 'Intruder Member B Update' }
    });
    expect(patchResIdRes.statusCode).toBe(404);
    expect(JSON.parse(patchResIdRes.payload).error).toMatch(/not found in this gym/i);

    // POST reset-password where staff belongs to Gym B, but triggered under Gym A
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/staff/${staffBId}/reset-password`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(resetRes.statusCode).toBe(404);
    expect(JSON.parse(resetRes.payload).error).toMatch(/not found in this gym/i);

    // GET /api/gyms/:gymId/plans/:planId where plan belongs to Gym B, but queried under Gym A
    const getPlanRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/plans/${planBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getPlanRes.statusCode).toBe(404);
    expect(JSON.parse(getPlanRes.payload).error).toMatch(/not found in this gym/i);

    // PATCH /api/gyms/:gymId/plans/:planId where plan belongs to Gym B, but edited under Gym A
    const patchPlanRes = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${gymAId}/plans/${planBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { name: 'Intruder Plan Update' }
    });
    expect(patchPlanRes.statusCode).toBe(404);
    expect(JSON.parse(patchPlanRes.payload).error).toMatch(/not found in this gym/i);

    // DELETE /api/gyms/:gymId/plans/:planId where plan belongs to Gym B, but deleted under Gym A
    const deletePlanRes = await app.inject({
      method: 'DELETE',
      url: `/api/gyms/${gymAId}/plans/${planBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(deletePlanRes.statusCode).toBe(404);
    expect(JSON.parse(deletePlanRes.payload).error).toMatch(/not found in this gym/i);

    // GET /api/gyms/:gymId/members/:memberId/subscriptions where member belongs to Gym B
    const getMemberSubsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberBId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getMemberSubsRes.statusCode).toBe(404);
    expect(JSON.parse(getMemberSubsRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/members/:memberId/subscriptions where member belongs to Gym B
    const postMemberSubsRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members/${memberBId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { planId: planAId }
    });
    expect(postMemberSubsRes.statusCode).toBe(404);
    expect(JSON.parse(postMemberSubsRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/members/:memberId/subscriptions where plan belongs to Gym B (cross-tenant plan hijack)
    const postCrossPlanRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/members/${memberAId}/subscriptions`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { planId: planBId }
    });
    expect(postCrossPlanRes.statusCode).toBe(404);
    expect(JSON.parse(postCrossPlanRes.payload).error).toMatch(/plan not found in this gym/i);

    // GET /api/gyms/:gymId/subscriptions/:subscriptionId where subscription belongs to Gym B
    const getSubRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/subscriptions/${subBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getSubRes.statusCode).toBe(404);
    expect(JSON.parse(getSubRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/subscriptions/:subscriptionId/cancel where subscription belongs to Gym B
    const cancelSubRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/subscriptions/${subBId}/cancel`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(cancelSubRes.statusCode).toBe(404);
    expect(JSON.parse(cancelSubRes.payload).error).toMatch(/not found in this gym/i);

    // GET /api/gyms/:gymId/payments/:paymentId where payment belongs to Gym B
    const getPaymentRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/payments/${paymentBId}`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getPaymentRes.statusCode).toBe(404);
    expect(JSON.parse(getPaymentRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/payments/:paymentId/refund where payment belongs to Gym B
    const refundPaymentRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/payments/${paymentBId}/refund`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 1000
      }
    });
    expect(refundPaymentRes.statusCode).toBe(404);
    expect(JSON.parse(refundPaymentRes.payload).error).toMatch(/not found in this gym/i);

    // GET /api/gyms/:gymId/members/:memberId/financials where member belongs to Gym B
    const getFinancialsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberBId}/financials`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(getFinancialsRes.statusCode).toBe(404);
    expect(JSON.parse(getFinancialsRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/attendance/:attendanceId/void where attendance belongs to Gym B
    const voidResIdRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/attendance/${attendanceBId}/void`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: {
        voidReason: 'Tampering void across gym'
      }
    });
    expect(voidResIdRes.statusCode).toBe(404);
    expect(JSON.parse(voidResIdRes.payload).error).toMatch(/not found in this gym/i);

    // GET /api/gyms/:gymId/members/:memberId/attendance where member belongs to Gym B
    const memberAttResIdRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymAId}/members/${memberBId}/attendance`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(memberAttResIdRes.statusCode).toBe(404);
    expect(JSON.parse(memberAttResIdRes.payload).error).toMatch(/not found in this gym/i);

    // POST /api/gyms/:gymId/registration-requests/:requestId/approve where request belongs to Gym B
    const approveResIdRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/registration-requests/${requestBId}/approve`,
      headers: { authorization: `Bearer ${ownerAToken}` }
    });
    expect(approveResIdRes.statusCode).toBe(404);
    expect(JSON.parse(approveResIdRes.payload).error).toMatch(/not found/i);

    // POST /api/gyms/:gymId/registration-requests/:requestId/reject where request belongs to Gym B
    const rejectResIdRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymAId}/registration-requests/${requestBId}/reject`,
      headers: { authorization: `Bearer ${ownerAToken}` },
      payload: { reason: 'Cross tenant reject test' }
    });
    expect(rejectResIdRes.statusCode).toBe(404);
    expect(JSON.parse(rejectResIdRes.payload).error).toMatch(/not found/i);
  });
});

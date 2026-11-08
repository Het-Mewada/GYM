import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
import type pg from 'pg';
import { createPool } from '@gym/db';
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
  { method: 'POST', url: '/api/gyms', isTenantScoped: false, notes: 'User-scoped gym provisioning' },
  { method: 'GET', url: '/api/gyms', isTenantScoped: false, notes: 'List gyms (platform admin gets all; users get memberships)' },

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
  });

  afterAll(async () => {
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
  });
});

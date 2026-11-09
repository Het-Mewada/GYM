import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('Audit Logs & Platform Super Admin System Metrics', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const ownerPhone = `+91971${Math.floor(1000000 + Math.random() * 9000000)}`;
  const otherOwnerPhone = `+91972${Math.floor(1000000 + Math.random() * 9000000)}`;
  const superAdminPhone = '+919999900000';
  const superAdminEmail = 'superadmin@gymsaas.local';
  const password = 'SuperSecurePassword123!';

  let ownerToken: string;
  let otherOwnerToken: string;
  let superAdminToken: string;
  let gymId: string;
  let otherGymId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // 1. Setup Gym 1
    await pool.query('SELECT auth_register_user($1, $2, $3);', [ownerPhone, passHash, 'Audit Gym Owner']);
    const u1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: ownerPhone, password }
    });
    ownerToken = u1Login.json().accessToken;

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Audit Test Gym', slug: `audit-gym-${Date.now()}` }
    });
    gymId = g1Res.json().gymId;

    // 2. Setup Gym 2
    await pool.query('SELECT auth_register_user($1, $2, $3);', [otherOwnerPhone, passHash, 'Other Owner']);
    const u2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: otherOwnerPhone, password }
    });
    otherOwnerToken = u2Login.json().accessToken;

    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${otherOwnerToken}` },
      payload: { name: 'Other Audit Gym', slug: `other-audit-${Date.now()}` }
    });
    otherGymId = g2Res.json().gymId;

    // 3. Login as seeded Super Admin (+919999900000)
    const saLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: superAdminPhone, password: 'Password123!' }
    });
    superAdminToken = saLogin.json().accessToken;

    // Insert initial audit logs into Gym 1 for testing
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gymId]);
      await client.query(
        `INSERT INTO audit_logs (gym_id, actor_type, action, entity_type, entity_id, changed_fields, metadata)
         VALUES ($1, 'user', 'member.created', 'member', gen_random_uuid(), ARRAY['firstName', 'phone'], '{"memberNumber": "MEM-00001"}'::jsonb),
                ($1, 'user', 'payment.recorded', 'payment', gen_random_uuid(), ARRAY['amountCents'], '{"receiptNumber": "REC-00001", "amountCents": 500000}'::jsonb);`,
        [gymId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (gymId) await cleanupTenant(pool, gymId);
    if (otherGymId) await cleanupTenant(pool, otherGymId);
    await app.close();
  });

  it('1. allows Super Admin to fetch platform-wide metrics and recent activity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gyms/platform/metrics',
      headers: { authorization: `Bearer ${superAdminToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metrics).toBeDefined();
    expect(body.metrics.totalTenants).toBeGreaterThanOrEqual(2);
    expect(body.metrics.totalMembers).toBeGreaterThanOrEqual(0);
    expect(body.metrics.totalRevenueCents).toBeGreaterThanOrEqual(0);
    expect(body.metrics.totalCheckInsToday).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.recentActivity)).toBe(true);
  });

  it('2. forbids non-superadmin from accessing platform metrics (403 Forbidden)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/gyms/platform/metrics',
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Forbidden');
  });

  it('3. allows gym owner to list gym audit logs with filtering and pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/audit-logs`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);

    const firstLog = body.logs[0];
    expect(firstLog).toHaveProperty('action');
    expect(firstLog).toHaveProperty('entityType');
    expect(firstLog).toHaveProperty('metadata');

    // Filter by entityType = 'payment'
    const filterRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/audit-logs?entityType=payment`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(filterRes.statusCode).toBe(200);
    for (const log of filterRes.json().logs) {
      expect(log.entityType).toBe('payment');
    }
  });

  it('4. enforces tenant isolation on audit logs: Gym 2 owner cannot view Gym 1 audit logs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gymId}/audit-logs`,
      headers: { authorization: `Bearer ${otherOwnerToken}` }
    });

    expect(res.statusCode).toBe(403);
  });
});

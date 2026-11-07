import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { assertDatabaseRole, createPool } from '../src/db.js';

describe('Fastify API Test Harness & DB Startup Assertion', () => {
  it('asserts connection is app_user and neither rolsuper nor rolbypassrls', async () => {
    const pool = createPool('postgres://app_user:dev_app_password_only@localhost:5439/gym_saas_dev');
    try {
      const role = await assertDatabaseRole(pool);
      expect(role.rolname).toBe('app_user');
      expect(role.rolsuper).toBe(false);
      expect(role.rolbypassrls).toBe(false);
    } finally {
      await pool.end();
    }
  });

  it('responds with status ok on /health', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gym-api');
    await app.close();
  });
});

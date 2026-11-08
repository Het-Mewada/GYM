import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createPool } from '../src/client.js';
import { withTenantContext } from '../src/transaction.js';

describe('withTenantContext Transaction Runner', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sets parameterized app.gym_id and app.user_id within the transaction', async () => {
    const testGymId = '00000000-0000-0000-0000-000000000001';
    const testUserId = '00000000-0000-0000-0000-000000000002';

    const result = await withTenantContext(
      pool,
      { gymId: testGymId, userId: testUserId },
      async (_db, client) => {
        const res = await client.query<{ gym_id: string; user_id: string }>(`
          SELECT current_setting('app.gym_id') as gym_id, current_setting('app.user_id') as user_id;
        `);
        return res.rows[0];
      }
    );

    expect(result.gym_id).toBe(testGymId);
    expect(result.user_id).toBe(testUserId);
  });

  it('clears session context on transaction rollback and does not leak to next connection', async () => {
    const testGymId = '00000000-0000-0000-0000-000000000099';
    const testUserId = '00000000-0000-0000-0000-000000000098';

    await expect(
      withTenantContext(
        pool,
        { gymId: testGymId, userId: testUserId },
        async () => {
          throw new Error('Intentional failure');
        }
      )
    ).rejects.toThrow('Intentional failure');

    // Verify context is clean on fresh query
    const client = await pool.connect();
    try {
      const res = await client.query<{ gym_id: string }>(`
        SELECT current_setting('app.gym_id', true) as gym_id;
      `);
      expect(['', null]).toContain(res.rows[0].gym_id);
    } finally {
      client.release();
    }
  });
});

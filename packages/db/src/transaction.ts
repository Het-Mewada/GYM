import type pg from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export type TenantContext = {
  gymId: string;
  userId: string;
};

export type TenantDb = NodePgDatabase<typeof schema>;

export async function withTenantContext<T>(
  pool: pg.Pool,
  context: TenantContext,
  fn: (db: TenantDb, client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Security requirement: parameterized set_config with local=true, NEVER string-interpolated SET LOCAL
    await client.query(
      "SELECT set_config('app.gym_id', $1, true), set_config('app.user_id', $2, true)",
      [context.gymId, context.userId]
    );

    const db = drizzle(client, { schema });
    const result = await fn(db, client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error if connection died
    }
    throw err;
  } finally {
    client.release();
  }
}

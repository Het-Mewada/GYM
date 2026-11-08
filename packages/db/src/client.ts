import pg from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

export function createPool(connectionString?: string): pg.Pool {
  return new Pool({
    connectionString:
      connectionString ||
      process.env.DATABASE_URL ||
      'postgres://app_user:dev_app_password_only@localhost:5439/gym_saas_dev'
  });
}

export function createDb(pool: pg.Pool): NodePgDatabase<typeof schema> {
  return drizzle(pool, { schema });
}

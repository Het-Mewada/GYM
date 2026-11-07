import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { assertDatabaseRole, createPool } from './db.js';

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  const pool = createPool();

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: true, credentials: true });

  app.get('/health', async () => {
    let dbStatus = 'unverified';
    let dbRole = null;
    try {
      const role = await assertDatabaseRole(pool);
      dbStatus = 'healthy';
      dbRole = role.rolname;
    } catch (err: unknown) {
      dbStatus = `degraded: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      status: 'ok',
      service: 'gym-api',
      database: {
        status: dbStatus,
        role: dbRole
      },
      timestamp: new Date().toISOString()
    };
  });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

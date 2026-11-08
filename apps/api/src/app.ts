import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { assertDatabaseRole, createPool } from '@gym/db';
import { authRoutes } from './auth/routes.js';
import { gymRoutes } from './routes/gyms.js';

export function buildApp(customPool?: pg.Pool) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  const pool = customPool || createPool();

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: true, credentials: true });
  app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'dev_cookie_secret_at_least_32_characters_long'
  });
  app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute'
  });

  // Health endpoint
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

  // Register routes
  app.register(authRoutes, { prefix: '/api/auth', pool });
  app.register(gymRoutes, { prefix: '/api/gyms', pool });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

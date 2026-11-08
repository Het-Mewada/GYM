import Fastify, { type RouteOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { assertDatabaseRole, createPool } from '@gym/db';
import { authRoutes } from './auth/routes.js';
import { gymRoutes } from './routes/gyms.js';

export interface BuildAppOptions {
  pool?: pg.Pool;
  onRoute?: (routeOptions: RouteOptions) => void;
}

export function buildApp(customPoolOrOptions?: pg.Pool | BuildAppOptions) {
  let pool: pg.Pool;
  let onRoute: ((routeOptions: RouteOptions) => void) | undefined;

  if (customPoolOrOptions && 'query' in customPoolOrOptions) {
    pool = customPoolOrOptions as pg.Pool;
  } else if (customPoolOrOptions) {
    const opts = customPoolOrOptions as BuildAppOptions;
    pool = opts.pool || createPool();
    onRoute = opts.onRoute;
  } else {
    pool = createPool();
  }

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  app.setErrorHandler((error, request, reply) => {
    if (process.env.NODE_ENV === 'test' && (!reply.statusCode || reply.statusCode >= 500)) {
      console.error(`[FASTIFY ERROR] ${request.method} ${request.url} failed with:`, error);
    }
    reply.send(error);
  });

  if (onRoute) {
    app.addHook('onRoute', onRoute);
  }

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

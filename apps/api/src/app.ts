import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: true, credentials: true });

  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'gym-api',
      timestamp: new Date().toISOString()
    };
  });

  return app;
}

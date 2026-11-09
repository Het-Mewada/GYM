import type { FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { verifyAccessToken, UserJwtPayload } from '../auth/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserJwtPayload;
    tenantContext?: {
      gymId: string;
      userId: string;
      role: string;
    };
  }
}

export async function authenticateUser(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired access token' });
  }
}

export function createRequireTenantMembership(pool: pg.Pool) {
  return async function requireTenantMembership(
    req: FastifyRequest,
    reply: FastifyReply
  ) {
    if (!req.user) {
      return reply.status(401).send({ error: 'Unauthorized: User authentication required' });
    }

    const params = req.params as Record<string, unknown> | undefined;
    const body = req.body as Record<string, unknown> | undefined;

    const routeGymId = (params?.gymId as string | undefined) || (req.headers['x-gym-id'] as string);
    if (!routeGymId) {
      return reply.status(400).send({ error: 'Gym ID is required in route params or x-gym-id header' });
    }

    // Body tenant cross-validation (Path IDs AND Body IDs)
    const bodyGymId = body?.gymId || body?.gym_id;
    if (bodyGymId && bodyGymId !== routeGymId) {
      return reply.status(403).send({
        error: `Cross-tenant violation: body gym_id (${bodyGymId}) does not match route gym_id (${routeGymId})`
      });
    }

    // Platform Super Admin Bypass / Global Oversight
    if (req.user.isPlatformAdmin) {
      req.tenantContext = {
        gymId: routeGymId,
        userId: req.user.userId,
        role: 'owner'
      };
      return;
    }

    // Check membership under app.user_id context
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [req.user.userId]);

      const res = await client.query<{ gym_id: string; role: string; is_active: boolean }>(`
        SELECT gym_id, role, is_active
        FROM user_gym_memberships
        WHERE user_id = $1 AND gym_id = $2 AND is_active = true;
      `, [req.user.userId, routeGymId]);

      const membership = res.rows[0];
      await client.query('COMMIT');

      if (!membership) {
        return reply.status(403).send({
          error: 'Forbidden: You do not have active membership in this gym tenant'
        });
      }

      req.tenantContext = {
        gymId: routeGymId,
        userId: req.user.userId,
        role: membership.role
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
}

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { MemberRegistrationRequestSchema } from '@gym/shared';

interface PublicRoutesOptions {
  pool: pg.Pool;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const publicRoutes: FastifyPluginAsync<PublicRoutesOptions> = async (fastify, { pool }) => {
  // 1. GET /api/public/gyms/:gymSlugOrId/info
  fastify.get<{
    Params: { gymSlugOrId: string };
  }>('/:gymSlugOrId/info', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { gymSlugOrId } = req.params;
    if (!gymSlugOrId || !gymSlugOrId.trim()) {
      return reply.status(400).send({ error: 'Gym identifier or slug is required' });
    }

    const isUuid = UUID_REGEX.test(gymSlugOrId);
    const query = isUuid
      ? 'SELECT id, name, slug, default_country, currency, timezone, status FROM tenants WHERE id = $1;'
      : 'SELECT id, name, slug, default_country, currency, timezone, status FROM tenants WHERE slug = $1;';

    const res = await pool.query<{
      id: string;
      name: string;
      slug: string;
      default_country: string;
      currency: string;
      timezone: string;
      status: string;
    }>(query, [gymSlugOrId]);

    const tenant = res.rows[0];
    if (!tenant || tenant.status === 'suspended') {
      return reply.status(404).send({ error: 'Gym not found or inactive' });
    }

    return reply.send({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      defaultCountry: tenant.default_country,
      currency: tenant.currency,
      timezone: tenant.timezone
    });
  });

  // 2. POST /api/public/gyms/:gymSlugOrId/register
  fastify.post<{
    Params: { gymSlugOrId: string };
    Body: unknown;
  }>('/:gymSlugOrId/register', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes'
      }
    }
  }, async (req, reply) => {
    const { gymSlugOrId } = req.params;
    if (!gymSlugOrId || !gymSlugOrId.trim()) {
      return reply.status(400).send({ error: 'Gym identifier or slug is required' });
    }

    // Resolve tenant
    const isUuid = UUID_REGEX.test(gymSlugOrId);
    const query = isUuid
      ? 'SELECT id, name, status FROM tenants WHERE id = $1;'
      : 'SELECT id, name, status FROM tenants WHERE slug = $1;';

    const res = await pool.query<{ id: string; name: string; status: string }>(query, [gymSlugOrId]);
    const tenant = res.rows[0];
    if (!tenant || tenant.status === 'suspended') {
      return reply.status(404).send({ error: 'Gym not found or inactive' });
    }

    // Validate request body
    const parseRes = MemberRegistrationRequestSchema.safeParse(req.body);
    if (!parseRes.success) {
      const issue = parseRes.error.issues[0];
      return reply.status(400).send({
        error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Validation error',
        details: parseRes.error.issues
      });
    }

    const {
      firstName,
      lastName,
      phone,
      email,
      gender,
      dateOfBirth,
      emergencyContactName,
      emergencyContactPhone,
      notes
    } = parseRes.data;

    try {
      const insertRes = await pool.query<{ submit_member_registration_request: string }>(
        'SELECT submit_member_registration_request($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as submit_member_registration_request;',
        [
          tenant.id,
          firstName,
          lastName || null,
          phone,
          email || null,
          gender,
          dateOfBirth || null,
          emergencyContactName || null,
          emergencyContactPhone || null,
          notes || null
        ]
      );

      const requestId = insertRes.rows[0]?.submit_member_registration_request;

      return reply.status(201).send({
        success: true,
        requestId,
        gymName: tenant.name,
        message: `Your registration request has been submitted to ${tenant.name}. The gym staff will review and approve your membership.`
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already registered') || msg.includes('already pending review')) {
        return reply.status(409).send({ error: msg });
      }
      return reply.status(400).send({ error: msg });
    }
  });
};

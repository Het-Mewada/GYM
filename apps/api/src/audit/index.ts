import type pg from 'pg';

export interface AuditLogInput {
  gymId: string;
  userId?: string | null;
  actorType?: 'user' | 'system';
  action: string;
  entityType: string;
  entityId: string;
  changedFields?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a strictly append-only, PII-free audit log record.
 */
export async function insertAuditLog(
  client: pg.PoolClient | pg.Pool,
  input: AuditLogInput
): Promise<string> {
  const actorType = input.actorType || (input.userId ? 'user' : 'system');
  const changedFields = input.changedFields || [];
  const metadata = input.metadata || {};

  const res = await client.query<{ id: string }>(
    `INSERT INTO audit_logs (gym_id, user_id, actor_type, action, entity_type, entity_id, changed_fields, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id;`,
    [
      input.gymId,
      input.userId || null,
      actorType,
      input.action,
      input.entityType,
      input.entityId,
      changedFields,
      JSON.stringify(metadata)
    ]
  );

  return res.rows[0].id;
}

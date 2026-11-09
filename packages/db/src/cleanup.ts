import type pg from 'pg';

/**
 * Clean up a specific tenant and all its associated child data in PostgreSQL.
 * Uses SECURITY DEFINER function cleanup_tenant(p_tenant_id).
 */
export async function cleanupTenant(pool: pg.Pool, gymId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ cleanup_tenant: boolean }>(
      'SELECT cleanup_tenant($1) as cleanup_tenant;',
      [gymId]
    );
    return res.rows[0]?.cleanup_tenant ?? false;
  } finally {
    client.release();
  }
}

/**
 * Clean up all ephemeral test tenants (e.g. created with epoch timestamps or test prefixes).
 * Uses SECURITY DEFINER function cleanup_test_tenants().
 */
export async function cleanupTestTenants(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ cleanup_test_tenants: number }>(
      'SELECT cleanup_test_tenants() as cleanup_test_tenants;'
    );
    return res.rows[0]?.cleanup_test_tenants ?? 0;
  } finally {
    client.release();
  }
}

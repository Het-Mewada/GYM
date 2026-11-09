import { createPool } from '../src/client.js';
import { cleanupTestTenants } from '../src/cleanup.js';

export async function setup() {
  const pool = createPool();
  try {
    await cleanupTestTenants(pool);
  } catch (err) {
    console.warn('[GlobalSetup] Error during initial test tenant cleanup:', err);
  } finally {
    await pool.end();
  }
}

export async function teardown() {
  // Teardown does not call cleanupTestTenants to prevent deleting test tenants
  // that may still be used by concurrent test suites (e.g. @gym/api).
  // Stale test tenants are cleaned up during setup() and @gym/api's teardown().
}

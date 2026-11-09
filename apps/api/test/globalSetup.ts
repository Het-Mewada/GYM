import { createPool, cleanupTestTenants } from '@gym/db';

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
  const pool = createPool();
  try {
    await cleanupTestTenants(pool);
  } catch (err) {
    console.warn('[GlobalTeardown] Error during final test tenant cleanup:', err);
  } finally {
    await pool.end();
  }
}

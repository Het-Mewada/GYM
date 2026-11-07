import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString?: string) {
  return new Pool({
    connectionString: connectionString || process.env.DATABASE_URL || 'postgres://app_user:dev_app_password_only@localhost:5439/gym_saas_dev'
  });
}

export async function assertDatabaseRole(pool: pg.Pool) {
  const result = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user;
  `);

  const role = result.rows[0];
  if (!role) {
    throw new Error('Database assertion failed: current_user not found in pg_roles');
  }
  if (role.rolsuper === true) {
    throw new Error(`SECURITY VIOLATION: Connection role '${role.rolname}' is a superuser. Must connect as app_user.`);
  }
  if (role.rolbypassrls === true) {
    throw new Error(`SECURITY VIOLATION: Connection role '${role.rolname}' has BYPASSRLS. Must connect as NOBYPASSRLS app_user.`);
  }

  return role;
}

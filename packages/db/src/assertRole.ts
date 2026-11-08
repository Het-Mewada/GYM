import type pg from 'pg';

export interface DatabaseRoleInfo {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export async function assertDatabaseRole(pool: pg.Pool): Promise<DatabaseRoleInfo> {
  const result = await pool.query<DatabaseRoleInfo>(`
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

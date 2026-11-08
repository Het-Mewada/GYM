import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createPool } from '../src/client.js';
import { assertDatabaseRole } from '../src/assertRole.js';
import * as schema from '../src/schema.js';
import { getTableColumns, isTable } from 'drizzle-orm';

describe('Database Schema Drift Verification', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool();
    await assertDatabaseRole(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should match every table and column in PostgreSQL against Drizzle schema', async () => {
    // 1. Fetch all public tables from pg_tables
    const tablesRes = await pool.query<{ table_name: string }>(`
      SELECT tablename as table_name
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    const dbTables = tablesRes.rows.map(r => r.table_name);

    // 2. Fetch all public columns from pg_attribute
    const columnsRes = await pool.query<{ table_name: string; column_name: string }>(`
      SELECT c.relname as table_name, a.attname as column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY table_name, a.attnum;
    `);

    const dbColumnsByTable: Record<string, string[]> = {};
    for (const col of columnsRes.rows) {
      if (!dbColumnsByTable[col.table_name]) {
        dbColumnsByTable[col.table_name] = [];
      }
      dbColumnsByTable[col.table_name].push(col.column_name);
    }

    // 3. Extract tables and columns from Drizzle schema
    const drizzleTables: Record<string, string[]> = {};

    for (const [exportName, exportedItem] of Object.entries(schema)) {
      if (isTable(exportedItem)) {
        const tableName = (exportedItem as any)[Symbol.for('drizzle:Name')] || (exportedItem as any)._?.name;
        if (!tableName) continue;

        const cols = getTableColumns(exportedItem);
        const colNames = Object.values(cols).map((c: any) => c.name);
        drizzleTables[tableName] = colNames;
      }
    }

    const drizzleTableNames = Object.keys(drizzleTables).sort();

    // Verify all DB tables exist in Drizzle
    for (const dbTable of dbTables) {
      expect(
        drizzleTableNames,
        `PostgreSQL table '${dbTable}' is missing from Drizzle schema.`
      ).toContain(dbTable);
    }

    // Verify all Drizzle tables exist in DB
    for (const drizzleTable of drizzleTableNames) {
      expect(
        dbTables,
        `Drizzle table '${drizzleTable}' does not exist in PostgreSQL.`
      ).toContain(drizzleTable);
    }

    // Verify every column matches exactly
    for (const tableName of dbTables) {
      const dbCols = (dbColumnsByTable[tableName] || []).sort();
      const drizzleCols = (drizzleTables[tableName] || []).sort();

      expect(
        drizzleCols,
        `Columns for table '${tableName}' drift between PostgreSQL and Drizzle.`
      ).toEqual(dbCols);
    }
  });

  it('should enforce role assertions at startup', async () => {
    const role = await assertDatabaseRole(pool);
    expect(role.rolname).toBe('app_user');
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });
});

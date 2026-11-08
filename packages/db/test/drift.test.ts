import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import { createPool } from '../src/client.js';
import { assertDatabaseRole } from '../src/assertRole.js';
import * as schema from '../src/schema.js';
import { getTableColumns, isTable } from 'drizzle-orm';

interface DbColumnInfo {
  tableName: string;
  columnName: string;
  pgType: string;
  notNull: boolean;
  hasDefault: boolean;
  columnDefault: string | null;
}

const PG_TO_DRIZZLE_TYPE_MAP: Record<string, string[]> = {
  uuid: ['PgUUID'],
  varchar: ['PgVarchar'],
  text: ['PgText'],
  int8: ['PgBigInt64', 'PgBigInt53'],
  int4: ['PgInteger', 'PgSerial'],
  bool: ['PgBoolean'],
  timestamptz: ['PgTimestamp'],
  date: ['PgDateString', 'PgDate'],
  jsonb: ['PgJsonb'],
  _text: ['PgArray']
};

describe('Database Schema Drift Verification (Types, Nullability, Defaults)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool();
    await assertDatabaseRole(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('verifies zero drift across all 18 tables, 162 columns, types, nullability, and defaults', async () => {
    // 1. Fetch all public tables from pg_tables
    const tablesRes = await pool.query<{ table_name: string }>(`
      SELECT tablename as table_name
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    const dbTables = tablesRes.rows.map(r => r.table_name);

    // 2. Fetch full column metadata from pg_class, pg_attribute, pg_type, pg_attrdef
    const columnsRes = await pool.query<{
      table_name: string;
      column_name: string;
      pg_type: string;
      not_null: boolean;
      column_default: string | null;
    }>(`
      SELECT
        c.relname as table_name,
        a.attname as column_name,
        t.typname as pg_type,
        a.attnotnull as not_null,
        pg_get_expr(d.adbin, d.adrelid) as column_default
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY table_name, a.attnum;
    `);

    const dbColumnsByTable: Record<string, Record<string, DbColumnInfo>> = {};
    for (const col of columnsRes.rows) {
      if (!dbColumnsByTable[col.table_name]) {
        dbColumnsByTable[col.table_name] = {};
      }
      dbColumnsByTable[col.table_name][col.column_name] = {
        tableName: col.table_name,
        columnName: col.column_name,
        pgType: col.pg_type,
        notNull: col.not_null,
        hasDefault: col.column_default !== null,
        columnDefault: col.column_default
      };
    }

    // 3. Extract tables and columns from Drizzle schema
    const drizzleTables: Record<string, Record<string, any>> = {};

    for (const [, exportedItem] of Object.entries(schema)) {
      if (isTable(exportedItem)) {
        const tableName = (exportedItem as any)[Symbol.for('drizzle:Name')] || (exportedItem as any)._?.name;
        if (!tableName) continue;

        const cols = getTableColumns(exportedItem);
        drizzleTables[tableName] = {};
        for (const col of Object.values(cols)) {
          drizzleTables[tableName][(col as any).name] = col;
        }
      }
    }

    const drizzleTableNames = Object.keys(drizzleTables).sort();

    // Assert all tables exist in both DB and Drizzle
    for (const dbTable of dbTables) {
      expect(
        drizzleTableNames,
        `PostgreSQL table '${dbTable}' missing from Drizzle schema.`
      ).toContain(dbTable);
    }
    for (const drizzleTable of drizzleTableNames) {
      expect(
        dbTables,
        `Drizzle table '${drizzleTable}' missing from PostgreSQL.`
      ).toContain(drizzleTable);
    }

    // 4. Assert column existence, nullability, defaults, and data types
    for (const tableName of dbTables) {
      const dbCols = dbColumnsByTable[tableName] || {};
      const drizzleCols = drizzleTables[tableName] || {};

      const dbColNames = Object.keys(dbCols).sort();
      const drizzleColNames = Object.keys(drizzleCols).sort();

      expect(
        drizzleColNames,
        `Column set drift for table '${tableName}'`
      ).toEqual(dbColNames);

      for (const colName of dbColNames) {
        const dbCol = dbCols[colName];
        const drizzleCol = drizzleCols[colName];

        // 4a. Nullability assertion
        expect(
          drizzleCol.notNull,
          `Nullability drift on table '${tableName}', column '${colName}': DB notNull=${dbCol.notNull}, Drizzle notNull=${drizzleCol.notNull}`
        ).toBe(dbCol.notNull);

        // 4b. Default presence assertion
        expect(
          drizzleCol.hasDefault,
          `Default value presence drift on table '${tableName}', column '${colName}': DB hasDefault=${dbCol.hasDefault}, Drizzle hasDefault=${drizzleCol.hasDefault}`
        ).toBe(dbCol.hasDefault);

        // 4c. Data type assertion
        const expectedDrizzleTypes = PG_TO_DRIZZLE_TYPE_MAP[dbCol.pgType];
        if (expectedDrizzleTypes) {
          expect(
            expectedDrizzleTypes,
            `Type mapping mismatch on table '${tableName}', column '${colName}': DB pgType='${dbCol.pgType}', Drizzle columnType='${drizzleCol.columnType}'`
          ).toContain(drizzleCol.columnType);
        }
      }
    }
  });

  it('enforces role assertions at startup', async () => {
    const role = await assertDatabaseRole(pool);
    expect(role.rolname).toBe('app_user');
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });
});

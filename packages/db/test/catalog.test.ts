import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createPool } from '../src/client.js';

describe('PostgreSQL Catalog Invariant Tests', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('Catalog Test 1: Every table with gym_id column has FORCE ROW LEVEL SECURITY enabled', async () => {
    const res = await pool.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE a.attname = 'gym_id'
        AND c.relkind = 'r'
        AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);
    `);

    expect(
      res.rows,
      `Found tables with gym_id missing FORCE RLS: ${JSON.stringify(res.rows)}`
    ).toEqual([]);
  });

  it('Catalog Test 2: Every table with gym_id column has at least one active RLS policy', async () => {
    const res = await pool.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE a.attname = 'gym_id'
        AND c.relkind = 'r'
        AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
    `);

    expect(
      res.rows,
      `Found tables with gym_id missing RLS policy: ${JSON.stringify(res.rows)}`
    ).toEqual([]);
  });

  it('Catalog Test 3: Every FK pointing to a tenant table is composite and includes gym_id', async () => {
    const res = await pool.query(`
      SELECT conname, conrelid::regclass::text as source_table, confrelid::regclass::text as target_table
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid::regclass::text IN ('members', 'subscriptions', 'payment_transactions', 'membership_plans', 'subscription_adjustments')
        AND NOT EXISTS (
          SELECT 1 FROM unnest(conkey) k
          JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
          WHERE a.attname = 'gym_id'
        );
    `);

    expect(
      res.rows,
      `Found non-composite FK referencing tenant table: ${JSON.stringify(res.rows)}`
    ).toEqual([]);
  });
});

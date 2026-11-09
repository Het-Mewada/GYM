import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('CSV Member Importer: Batch Import, Deduplication, and PII-Free Errors', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91951${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91952${Math.floor(1000000 + Math.random() * 9000000)}`;
  const staffPhone = `+91953${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1Token: string;
  let gym1Id: string;

  let gym2Token: string;
  let gym2Id: string;

  let staffToken: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // Setup Gym 1
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym1Phone, passHash, 'CSV Import Owner']);
    const u1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym1Phone, password }
    });
    gym1Token = u1Login.json().accessToken;

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { name: 'Metro Fitness Gym', slug: `metro-fit-${Date.now()}` }
    });
    gym1Id = g1Res.json().gymId;

    // Setup Gym 2
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym2Phone, passHash, 'Other Gym Owner']);
    const u2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym2Phone, password }
    });
    gym2Token = u2Login.json().accessToken;

    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: { name: 'Titan Club', slug: `titan-club-${Date.now()}` }
    });
    gym2Id = g2Res.json().gymId;

    // Setup regular staff (non-manager role)
    const staffReg = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [staffPhone, passHash, 'Gym Regular Staff']
    );
    const staffUserId = staffReg.rows[0].auth_register_user;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [gym1Id]);
      await client.query(
        "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, 'staff', true);",
        [gym1Id, staffUserId]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const staffLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: staffPhone, password }
    });
    staffToken = staffLogin.json().accessToken;
  });

  afterAll(async () => {
    if (gym1Id) await cleanupTenant(pool, gym1Id);
    if (gym2Id) await cleanupTenant(pool, gym2Id);
    await app.close();
  });

  it('1. successfully imports valid members with monotonic member numbers', async () => {
    const p1 = `982${Math.floor(1000000 + Math.random() * 9000000)}`;
    const p2 = `983${Math.floor(1000000 + Math.random() * 9000000)}`;
    const csvContent = `First Name,Last Name,Phone,Email,Gender,Date of Birth\nAarav,Sharma,${p1},aarav@example.com,male,1995-04-12\nPriya,Patel,${p2},priya@example.com,female,1998-11-23`;

    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/import-csv`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { csvContent, fileName: 'initial_batch.csv' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.importedCount).toBe(2);
    expect(body.errorCount).toBe(0);
    expect(body.totalRows).toBe(2);
    expect(body.job.status).toBe('completed');
    expect(body.job.fileName).toBe('initial_batch.csv');

    // Verify members are queryable via standard members API
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(listRes.statusCode).toBe(200);
    const membersList = listRes.json().members;
    const aarav = membersList.find((m: { firstName: string }) => m.firstName === 'Aarav');
    const priya = membersList.find((m: { firstName: string }) => m.firstName === 'Priya');
    expect(aarav).toBeDefined();
    expect(priya).toBeDefined();
    expect(aarav.memberNumber).toMatch(/^MEM-\d{5}$/);
    expect(priya.memberNumber).toMatch(/^MEM-\d{5}$/);
    expect(aarav.phone).toBe(`+91${p1}`);
  });

  it('2. rejects duplicate file upload with 409 Conflict via SHA-256 hash', async () => {
    const p = `984${Math.floor(1000000 + Math.random() * 9000000)}`;
    const csvContent = `First Name,Phone\nSameFile,${p}`;

    // First upload
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/import-csv`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { csvContent, fileName: 'dedup_test.csv' }
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().importedCount).toBe(1);

    // Second upload with identical content
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/import-csv`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { csvContent, fileName: 'dedup_test.csv' }
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error).toContain('already been imported');
  });

  it('3. generates PII-free error records for invalid rows and duplicate phones without aborting valid rows', async () => {
    // pExisting is already in Gym 1
    const pExisting = `985${Math.floor(1000000 + Math.random() * 9000000)}`;
    await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { firstName: 'Existing', lastName: 'Member', phone: `+91${pExisting}` }
    });

    const pValid = `986${Math.floor(1000000 + Math.random() * 9000000)}`;
    const pDupFile = `987${Math.floor(1000000 + Math.random() * 9000000)}`;

    const csvContent = [
      'First Name,Phone,Email',
      `ValidUser,${pValid},valid@user.com`,             // Row 2: valid
      `NoFirst,,missingphone@user.com`,                  // Row 3: missing firstName & phone
      `ExistingGuy,${pExisting},existing@user.com`,      // Row 4: duplicate phone in gym
      `DupOne,${pDupFile},dup1@user.com`,               // Row 5: first occurrence
      `DupTwo,${pDupFile},dup2@user.com`                // Row 6: duplicate phone in CSV
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/import-csv`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: { csvContent, fileName: 'mixed_batch.csv' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.importedCount).toBe(2); // ValidUser and DupOne are imported
    expect(body.errorCount).toBeGreaterThanOrEqual(3);

    // Verify errors_json is PII-free
    const errors = body.job.errorsJson;
    for (const err of errors) {
      expect(err).toHaveProperty('row');
      expect(err).toHaveProperty('field');
      expect(err).toHaveProperty('code');
      expect(err).toHaveProperty('message');
      // Verify no raw phone numbers in error text
      expect(err.message).not.toContain(pExisting);
      expect(err.message).not.toContain(pDupFile);
    }

    const row3Error = errors.find((e: { row: number; field: string }) => e.row === 3 && e.field === 'phone');
    expect(row3Error).toBeDefined();

    const row4Error = errors.find((e: { row: number }) => e.row === 4 && e.code === 'DUPLICATE_PHONE_IN_GYM');
    expect(row4Error).toBeDefined();

    const row6Error = errors.find((e: { row: number }) => e.row === 6 && e.code === 'DUPLICATE_PHONE_IN_CSV');
    expect(row6Error).toBeDefined();
  });

  it('4. enforces tenant isolation and lists import jobs per gym', async () => {
    // List jobs for Gym 1
    const list1 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/import-jobs`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(list1.statusCode).toBe(200);
    const jobs1 = list1.json().jobs;
    expect(jobs1.length).toBeGreaterThanOrEqual(2);

    // List jobs for Gym 2 (should be 0 or independent)
    const list2 = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members/import-jobs`,
      headers: { authorization: `Bearer ${gym2Token}` }
    });
    expect(list2.statusCode).toBe(200);
    expect(list2.json().jobs.length).toBe(0);

    // Gym 2 cannot view Gym 1's specific job
    const gym1JobId = jobs1[0].id;
    const crossGet = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members/import-jobs/${gym1JobId}`,
      headers: { authorization: `Bearer ${gym2Token}` }
    });
    expect(crossGet.statusCode).toBe(404);
  });

  it('5. forbids regular staff without manager/owner role from importing CSV', async () => {
    const csvContent = `First Name,Phone\nStaffTest,9881112233`;
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/import-csv`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { csvContent }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Forbidden');
  });
});

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres_dev_password@localhost:5439/gym_saas_dev',
  max: 10
});

async function runTest() {
  const setupClient = await pool.connect();
  let gymId, planId, userId, member1Id, member2Id;
  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const testPhone = `+91986${randSuffix}`;
  const testSlug = `overlap-${Date.now()}`;

  try {
    const regRes = await setupClient.query(`SELECT auth_register_user($1, 'hash', 'Overlap Tester') as uid;`, [testPhone]);
    userId = regRes.rows[0].uid;
    await setupClient.query(`SELECT set_config('app.user_id', $1, false);`, [userId]);

    const gymRes = await setupClient.query(`SELECT provision_gym($1, 'Overlap Gym V5', $2, 'IN', 'Asia/Kolkata', 'INR', 0) as gid;`, [userId, testSlug]);
    gymId = gymRes.rows[0].gid;

    await setupClient.query(`SELECT set_config('app.gym_id', $1, false);`, [gymId]);

    const planRes = await setupClient.query(`
      INSERT INTO membership_plans (gym_id, name, duration_days, price_cents)
      VALUES ($1, 'Monthly Plan', 30, 5000) RETURNING id;
    `, [gymId]);
    planId = planRes.rows[0].id;

    const mem1Res = await setupClient.query(`
      INSERT INTO members (gym_id, member_number, first_name, last_name, phone)
      VALUES ($1, 'MEM-OVL01', 'Control', 'Member', $2) RETURNING id;
    `, [gymId, `+919861${randSuffix.toString().slice(0, 5)}`]);
    member1Id = mem1Res.rows[0].id;

    const mem2Res = await setupClient.query(`
      INSERT INTO members (gym_id, member_number, first_name, last_name, phone)
      VALUES ($1, 'MEM-OVL02', 'Guarded', 'Member', $2) RETURNING id;
    `, [gymId, `+919862${randSuffix.toString().slice(0, 5)}`]);
    member2Id = mem2Res.rows[0].id;
  } finally {
    setupClient.release();
  }

  console.log('======================================================================');
  console.log('PART 1: CONTROL RUN (Validation Kept, ONLY pg_advisory_xact_lock Removed)');
  console.log('======================================================================');

  // Replace trigger function with UNLOCKED version (keeps overlap query, removes ONLY advisory lock)
  const adminClient = await pool.connect();
  await adminClient.query(`
    CREATE OR REPLACE FUNCTION validate_subscription_overlap()
    RETURNS TRIGGER AS $$
    DECLARE
      v_overlapping_id UUID;
    BEGIN
      IF current_setting('app.in_freeze_shift', true) = 'true' THEN
        RETURN NEW;
      END IF;

      IF NEW.status IN ('active', 'queued') THEN
        SELECT s.id INTO v_overlapping_id
        FROM subscriptions s
        WHERE s.gym_id = NEW.gym_id
          AND s.member_id = NEW.member_id
          AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND s.status IN ('active', 'queued')
          AND (NEW.start_date <= s.end_date AND NEW.end_date >= s.start_date)
        LIMIT 1;

        IF v_overlapping_id IS NOT NULL THEN
          RAISE EXCEPTION 'Subscription dates [% to %] overlap with existing subscription %',
            NEW.start_date, NEW.end_date, v_overlapping_id;
        END IF;

        -- ONLY pg_advisory_xact_lock removed! Sleep 250ms after check to ensure race overlap
        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  adminClient.release();

  const client1 = await pool.connect();
  const client2 = await pool.connect();

  async function executeSubInsertOnClient(client, name, memberId, startDate, endDate) {
    try {
      await client.query('BEGIN;');
      await client.query(`SELECT set_config('app.gym_id', $1, true);`, [gymId]);
      await client.query(`SELECT set_config('app.user_id', $1, true);`, [userId]);

      const res = await client.query(`
        INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
        VALUES ($1, $2, $3, 'active', $4, $5, 5000) RETURNING id;
      `, [gymId, memberId, planId, startDate, endDate]);

      await client.query('COMMIT;');
      return { name, success: true, id: res.rows[0].id };
    } catch (err) {
      await client.query('ROLLBACK;');
      return { name, success: false, error: err.message };
    }
  }

  const [ctrl1, ctrl2] = await Promise.all([
    executeSubInsertOnClient(client1, 'Control-Thread-1', member1Id, '2026-12-01', '2026-12-30'),
    executeSubInsertOnClient(client2, 'Control-Thread-2', member1Id, '2026-12-15', '2027-01-14')
  ]);

  client1.release();
  client2.release();

  console.log(`- ${ctrl1.name}: ${ctrl1.success ? 'SUCCESS (Inserted sub ' + ctrl1.id + ')' : 'FAILED: ' + ctrl1.error}`);
  console.log(`- ${ctrl2.name}: ${ctrl2.success ? 'SUCCESS (Inserted sub ' + ctrl2.id + ')' : 'FAILED: ' + ctrl2.error}`);

  const checkCtrl = await pool.query(`
    SELECT count(*) as total_active FROM subscriptions
    WHERE gym_id = $1 AND member_id = $2 AND status = 'active';
  `, [gymId, member1Id]);

  console.log(`Result of Control Run: Total active overlapping subscriptions = ${checkCtrl.rows[0].total_active}`);
  if (Number(checkCtrl.rows[0].total_active) === 2) {
    console.log('CONFIRMED: Without pg_advisory_xact_lock, race condition occurs (overlapping active subscriptions committed).');
  } else {
    console.error('UNEXPECTED CONTROL RESULT: Expected 2 subscriptions.');
    process.exit(1);
  }

  console.log('\n======================================================================');
  console.log('PART 2: GUARDED RUN (pg_advisory_xact_lock Restored and Active)');
  console.log('======================================================================');

  // Restore trigger function WITH pg_advisory_xact_lock
  const adminClient2 = await pool.connect();
  await adminClient2.query(`
    CREATE OR REPLACE FUNCTION validate_subscription_overlap()
    RETURNS TRIGGER AS $$
    DECLARE
      v_overlapping_id UUID;
      v_lock_key1 INT;
      v_lock_key2 INT;
    BEGIN
      IF current_setting('app.in_freeze_shift', true) = 'true' THEN
        RETURN NEW;
      END IF;

      IF NEW.status IN ('active', 'queued') THEN
        -- Two-key advisory transaction lock per member to serialize concurrent subscription creations
        v_lock_key1 := hashtext('sub_overlap_' || NEW.gym_id::text);
        v_lock_key2 := ('x' || substr(md5(NEW.member_id::text), 1, 8))::bit(32)::int;
        PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

        SELECT s.id INTO v_overlapping_id
        FROM subscriptions s
        WHERE s.gym_id = NEW.gym_id
          AND s.member_id = NEW.member_id
          AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND s.status IN ('active', 'queued')
          AND (NEW.start_date <= s.end_date AND NEW.end_date >= s.start_date)
        LIMIT 1;

        IF v_overlapping_id IS NOT NULL THEN
          RAISE EXCEPTION 'Subscription dates [% to %] overlap with existing subscription %',
            NEW.start_date, NEW.end_date, v_overlapping_id;
        END IF;

        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  adminClient2.release();

  const clientG1 = await pool.connect();
  const clientG2 = await pool.connect();

  const [guard1, guard2] = await Promise.all([
    executeSubInsertOnClient(clientG1, 'Guarded-Thread-1', member2Id, '2026-12-01', '2026-12-30'),
    executeSubInsertOnClient(clientG2, 'Guarded-Thread-2', member2Id, '2026-12-15', '2027-01-14')
  ]);

  clientG1.release();
  clientG2.release();

  console.log(`- ${guard1.name}: ${guard1.success ? 'SUCCESS (Inserted sub ' + guard1.id + ')' : 'FAILED: ' + guard1.error}`);
  console.log(`- ${guard2.name}: ${guard2.success ? 'SUCCESS (Inserted sub ' + guard2.id + ')' : 'FAILED: ' + guard2.error}`);

  const checkGuard = await pool.query(`
    SELECT count(*) as total_active FROM subscriptions
    WHERE gym_id = $1 AND member_id = $2 AND status = 'active';
  `, [gymId, member2Id]);

  console.log(`Result of Guarded Run: Total active subscriptions = ${checkGuard.rows[0].total_active}`);
  if (Number(checkGuard.rows[0].total_active) === 1) {
    console.log('SUCCESS: Two-key advisory lock serialized the transactions. Exactly one succeeded, second was rejected with overlap error!');
  } else {
    console.error('FAILURE: Unexpected guarded total!');
    process.exit(1);
  }

  await pool.end();
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});

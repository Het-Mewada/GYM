import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres_dev_password@localhost:5439/gym_saas_dev',
  max: 10
});

async function runTest() {
  const setupClient = await pool.connect();
  let gymId, memberId, subId, payId, userId;
  const randSuffix = Math.floor(100000 + Math.random() * 900000);
  const testPhone = `+91987${randSuffix}`;
  const testSlug = `concurr-${Date.now()}`;

  try {
    const regRes = await setupClient.query(`SELECT auth_register_user($1, 'hash', 'Refund Tester') as uid;`, [testPhone]);
    userId = regRes.rows[0].uid;
    await setupClient.query(`SELECT set_config('app.user_id', $1, false);`, [userId]);

    const gymRes = await setupClient.query(`SELECT provision_gym($1, 'Concurrency Gym V5', $2, 'IN', 'Asia/Kolkata', 'INR', 0) as gid;`, [userId, testSlug]);
    gymId = gymRes.rows[0].gid;

    await setupClient.query(`SELECT set_config('app.gym_id', $1, false);`, [gymId]);

    const planRes = await setupClient.query(`
      INSERT INTO membership_plans (gym_id, name, duration_days, price_cents)
      VALUES ($1, 'Plan 50', 30, 5000) RETURNING id;
    `, [gymId]);

    const memRes = await setupClient.query(`
      INSERT INTO members (gym_id, member_number, first_name, last_name, phone)
      VALUES ($1, 'MEM-CONCV5', 'Concurrent', 'Member', $2) RETURNING id;
    `, [gymId, testPhone]);
    memberId = memRes.rows[0].id;

    // Set price_adjustment_cents to 5000 so refund semantics allow refunds up to 5000+ cents
    const subRes = await setupClient.query(`
      INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents, price_adjustment_cents)
      VALUES ($1, $2, $3, 'active', CURRENT_DATE, CURRENT_DATE + 30, 5000, 5000) RETURNING id;
    `, [gymId, memberId, planRes.rows[0].id]);
    subId = subRes.rows[0].id;

    const receipt = await setupClient.query(`SELECT generate_next_receipt_number($1) as r;`, [gymId]);
    const payRes = await setupClient.query(`
      INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
      VALUES ($1, $2, $3, gen_random_uuid(), $4, 'payment', 'cash', 5000, $5) RETURNING id;
    `, [gymId, memberId, subId, receipt.rows[0].r, userId]);
    payId = payRes.rows[0].id;
  } finally {
    setupClient.release();
  }

  console.log('======================================================================');
  console.log('PART 1: CONTROL RUN (Validation Kept, ONLY pg_advisory_xact_lock Removed)');
  console.log('======================================================================');

  // Replace trigger function with UNLOCKED version (keeps all validation, removes ONLY lock)
  const adminClient = await pool.connect();
  await adminClient.query(`
    CREATE OR REPLACE FUNCTION validate_refund_limit()
    RETURNS TRIGGER AS $$
    DECLARE
      v_parent_amount BIGINT;
      v_parent_type VARCHAR(20);
      v_total_refunded BIGINT;
    BEGIN
      IF NEW.type IN ('refund', 'reversal') THEN
        SELECT amount_cents, type INTO v_parent_amount, v_parent_type
        FROM payment_transactions
        WHERE gym_id = NEW.gym_id AND id = NEW.parent_transaction_id;

        IF v_parent_amount IS NULL THEN
          RAISE EXCEPTION 'Parent payment transaction % not found for gym.', NEW.parent_transaction_id;
        END IF;

        IF v_parent_type <> 'payment' THEN
          RAISE EXCEPTION 'Cannot refund a transaction of type %. Parent must be payment.', v_parent_type;
        END IF;

        SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_refunded
        FROM payment_transactions
        WHERE gym_id = NEW.gym_id
          AND parent_transaction_id = NEW.parent_transaction_id
          AND type IN ('refund', 'reversal');

        IF (v_total_refunded + ABS(NEW.amount_cents)) > v_parent_amount THEN
          RAISE EXCEPTION 'Cumulative refund amount (%) exceeds original payment (%).', 
            (v_total_refunded + ABS(NEW.amount_cents)), v_parent_amount;
        END IF;

        -- ONLY pg_advisory_xact_lock removed! Sleep 250ms after read to ensure race overlap
        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  adminClient.release();

  // Pre-acquire 2 client connections to eliminate TCP connection setup delay during race
  const client1 = await pool.connect();
  const client2 = await pool.connect();

  async function executeRefundOnClient(client, name, targetPayId, prefix) {
    try {
      await client.query('BEGIN;');
      await client.query(`SELECT set_config('app.gym_id', $1, true);`, [gymId]);
      await client.query(`SELECT set_config('app.user_id', $1, true);`, [userId]);

      await client.query(`
        INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
        VALUES ($1, $2, gen_random_uuid(), $3, 'refund', 'cash', -3000, $4, $5);
      `, [gymId, memberId, `REC-${prefix}-${name}`, targetPayId, userId]);

      await client.query('COMMIT;');
      return { name, success: true };
    } catch (err) {
      await client.query('ROLLBACK;');
      return { name, success: false, error: err.message };
    }
  }

  const [ctrl1, ctrl2] = await Promise.all([
    executeRefundOnClient(client1, 'Control-Thread-1', payId, 'CTRL'),
    executeRefundOnClient(client2, 'Control-Thread-2', payId, 'CTRL')
  ]);

  client1.release();
  client2.release();

  console.log(`- ${ctrl1.name}: ${ctrl1.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + ctrl1.error}`);
  console.log(`- ${ctrl2.name}: ${ctrl2.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + ctrl2.error}`);

  const checkCtrl = await pool.query(`
    SELECT SUM(ABS(amount_cents)) as total_refunded FROM payment_transactions
    WHERE gym_id = $1 AND parent_transaction_id = $2 AND type = 'refund';
  `, [gymId, payId]);

  console.log(`Result of Control Run: Total Refunded = ${checkCtrl.rows[0].total_refunded} cents against 5000 cents parent.`);
  if (Number(checkCtrl.rows[0].total_refunded) === 6000) {
    console.log('CONFIRMED: Without pg_advisory_xact_lock, race condition occurs (over-refund of 6000 cents succeeded).');
  } else {
    console.error('UNEXPECTED CONTROL RESULT: Expected 6000 cents.');
    process.exit(1);
  }

  console.log('\n======================================================================');
  console.log('PART 2: GUARDED RUN (pg_advisory_xact_lock Restored and Active)');
  console.log('======================================================================');

  // Restore trigger function WITH pg_advisory_xact_lock
  const adminClient2 = await pool.connect();
  await adminClient2.query(`
    CREATE OR REPLACE FUNCTION validate_refund_limit()
    RETURNS TRIGGER AS $$
    DECLARE
      v_parent_amount BIGINT;
      v_parent_type VARCHAR(20);
      v_total_refunded BIGINT;
      v_lock_key1 INT;
      v_lock_key2 INT;
    BEGIN
      IF NEW.type IN ('refund', 'reversal') THEN
        -- Two-key advisory transaction lock on parent transaction to serialize concurrent refunds
        v_lock_key1 := hashtext('refund_' || NEW.gym_id::text);
        v_lock_key2 := ('x' || substr(md5(NEW.parent_transaction_id::text), 1, 8))::bit(32)::int;
        PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

        SELECT amount_cents, type INTO v_parent_amount, v_parent_type
        FROM payment_transactions
        WHERE gym_id = NEW.gym_id AND id = NEW.parent_transaction_id;

        IF v_parent_amount IS NULL THEN
          RAISE EXCEPTION 'Parent payment transaction % not found for gym.', NEW.parent_transaction_id;
        END IF;

        IF v_parent_type <> 'payment' THEN
          RAISE EXCEPTION 'Cannot refund a transaction of type %. Parent must be payment.', v_parent_type;
        END IF;

        SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_refunded
        FROM payment_transactions
        WHERE gym_id = NEW.gym_id
          AND parent_transaction_id = NEW.parent_transaction_id
          AND type IN ('refund', 'reversal');

        IF (v_total_refunded + ABS(NEW.amount_cents)) > v_parent_amount THEN
          RAISE EXCEPTION 'Cumulative refund amount (%) exceeds original payment (%).', 
            (v_total_refunded + ABS(NEW.amount_cents)), v_parent_amount;
        END IF;

        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  adminClient2.release();

  // Create second payment of 5000 cents for guarded test
  const setupClient2 = await pool.connect();
  let payId2;
  try {
    await setupClient2.query(`SELECT set_config('app.gym_id', $1, false);`, [gymId]);
    await setupClient2.query(`SELECT set_config('app.user_id', $1, false);`, [userId]);
    const receipt2 = await setupClient2.query(`SELECT generate_next_receipt_number($1) as r;`, [gymId]);
    const payRes2 = await setupClient2.query(`
      INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
      VALUES ($1, $2, $3, gen_random_uuid(), $4, 'payment', 'cash', 5000, $5) RETURNING id;
    `, [gymId, memberId, subId, receipt2.rows[0].r, userId]);
    payId2 = payRes2.rows[0].id;
  } finally {
    setupClient2.release();
  }

  const clientG1 = await pool.connect();
  const clientG2 = await pool.connect();

  const [guard1, guard2] = await Promise.all([
    executeRefundOnClient(clientG1, 'Guarded-Thread-1', payId2, 'GUARD'),
    executeRefundOnClient(clientG2, 'Guarded-Thread-2', payId2, 'GUARD')
  ]);

  clientG1.release();
  clientG2.release();

  console.log(`- ${guard1.name}: ${guard1.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + guard1.error}`);
  console.log(`- ${guard2.name}: ${guard2.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + guard2.error}`);

  const checkGuard = await pool.query(`
    SELECT SUM(ABS(amount_cents)) as total_refunded FROM payment_transactions
    WHERE gym_id = $1 AND parent_transaction_id = $2 AND type = 'refund';
  `, [gymId, payId2]);

  console.log(`Result of Guarded Run: Total Refunded = ${checkGuard.rows[0].total_refunded} cents against 5000 cents parent.`);
  if (Number(checkGuard.rows[0].total_refunded) === 3000) {
    console.log('SUCCESS: Two-key advisory lock serialized the transactions. Exactly one succeeded, second was rejected with over-refund error!');
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

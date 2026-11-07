import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres_dev_password@localhost:5439/gym_saas_dev'
});

async function runTest() {
  const setupClient = await pool.connect();
  let gymId, memberId, subId, payId, userId;

  try {
    const regRes = await setupClient.query(`SELECT auth_register_user('+919876540001', 'hash', 'Refund Tester') as uid;`);
    userId = regRes.rows[0].uid;
    const gymRes = await setupClient.query(`SELECT provision_gym($1, 'Concurrency Gym V5', 'concurr-v5', 'IN', 'Asia/Kolkata', 'INR', 0) as gid;`, [userId]);
    gymId = gymRes.rows[0].gid;

    await setupClient.query(`SELECT set_config('app.gym_id', $1, false);`, [gymId]);
    await setupClient.query(`SELECT set_config('app.user_id', $1, false);`, [userId]);

    const planRes = await setupClient.query(`
      INSERT INTO membership_plans (gym_id, name, duration_days, price_cents)
      VALUES ($1, 'Plan 50', 30, 5000) RETURNING id;
    `, [gymId]);

    const memRes = await setupClient.query(`
      INSERT INTO members (gym_id, member_number, first_name, last_name, phone)
      VALUES ($1, 'MEM-CONCV5', 'Concurrent', 'Member', '+919876540001') RETURNING id;
    `, [gymId]);
    memberId = memRes.rows[0].id;

    const subRes = await setupClient.query(`
      INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
      VALUES ($1, $2, $3, 'active', CURRENT_DATE, CURRENT_DATE + 30, 5000) RETURNING id;
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
  console.log('PART 1: CONTROL RUN (Trigger Disabled: Simulating Unlocked Race Condition)');
  console.log('======================================================================');

  // Disable trigger temporarily for control run
  const adminClient = await pool.connect();
  await adminClient.query('ALTER TABLE payment_transactions DISABLE TRIGGER trg_payment_refund_limit;');
  adminClient.release();

  async function attemptUnlockedRefund(name) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(`SELECT set_config('app.gym_id', $1, true);`, [gymId]);
      await client.query(`SELECT set_config('app.user_id', $1, true);`, [userId]);

      // Read current sum (both threads see 0 simultaneously)
      const sumRes = await client.query(`
        SELECT COALESCE(SUM(ABS(amount_cents)), 0) as total FROM payment_transactions
        WHERE gym_id = $1 AND parent_transaction_id = $2 AND type = 'refund';
      `, [gymId, payId]);

      // Delay 50ms to widen race window
      await new Promise((r) => setTimeout(r, 50));

      await client.query(`
        INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
        VALUES ($1, $2, gen_random_uuid(), $3, 'refund', 'cash', -3000, $4, $5);
      `, [gymId, memberId, `REC-CTRL-${name}`, payId, userId]);

      await client.query('COMMIT;');
      return { name, success: true };
    } catch (err) {
      await client.query('ROLLBACK;');
      return { name, success: false, error: err.message };
    } finally {
      client.release();
    }
  }

  const [ctrl1, ctrl2] = await Promise.all([
    attemptUnlockedRefund('Control-Thread-1'),
    attemptUnlockedRefund('Control-Thread-2')
  ]);

  console.log(`- ${ctrl1.name}: ${ctrl1.success ? 'SUCCESS (Refunded 3000)' : 'FAILED'}`);
  console.log(`- ${ctrl2.name}: ${ctrl2.success ? 'SUCCESS (Refunded 3000)' : 'FAILED'}`);

  const checkCtrl = await pool.query(`
    SELECT SUM(ABS(amount_cents)) as total_refunded FROM payment_transactions
    WHERE gym_id = $1 AND parent_transaction_id = $2 AND type = 'refund';
  `, [gymId, payId]);

  console.log(`Result of Control Run: Total Refunded = ${checkCtrl.rows[0].total_refunded} cents against 5000 cents parent.`);
  if (Number(checkCtrl.rows[0].total_refunded) === 6000) {
    console.log('CONFIRMED: Without lock, race condition occurs (over-refund of 6000 cents succeeded).');
  }

  // Re-enable trigger
  const adminClient2 = await pool.connect();
  await adminClient2.query('ALTER TABLE payment_transactions ENABLE TRIGGER trg_payment_refund_limit;');
  adminClient2.release();

  console.log('\n======================================================================');
  console.log('PART 2: GUARDED RUN (Two-Key Advisory Lock Active: trg_payment_refund_limit)');
  console.log('======================================================================');

  // Create second payment of 5000 cents for guarded test
  const setupClient2 = await pool.connect();
  let payId2;
  try {
    const receipt2 = await setupClient2.query(`SELECT generate_next_receipt_number($1) as r;`, [gymId]);
    const payRes2 = await setupClient2.query(`
      INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
      VALUES ($1, $2, $3, gen_random_uuid(), $4, 'payment', 'cash', 5000, $5) RETURNING id;
    `, [gymId, memberId, subId, receipt2.rows[0].r, userId]);
    payId2 = payRes2.rows[0].id;
  } finally {
    setupClient2.release();
  }

  async function attemptGuardedRefund(name) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(`SELECT set_config('app.gym_id', $1, true);`, [gymId]);
      await client.query(`SELECT set_config('app.user_id', $1, true);`, [userId]);

      await client.query(`
        INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
        VALUES ($1, $2, gen_random_uuid(), $3, 'refund', 'cash', -3000, $4, $5);
      `, [gymId, memberId, `REC-GUARD-${name}`, payId2, userId]);

      await client.query('COMMIT;');
      return { name, success: true };
    } catch (err) {
      await client.query('ROLLBACK;');
      return { name, success: false, error: err.message };
    } finally {
      client.release();
    }
  }

  const [guard1, guard2] = await Promise.all([
    attemptGuardedRefund('Guarded-Thread-1'),
    attemptGuardedRefund('Guarded-Thread-2')
  ]);

  console.log(`- ${guard1.name}: ${guard1.success ? 'SUCCESS (Refunded 3000)' : 'FAILED: ' + guard1.error}`);
  console.log(`- ${guard2.name}: ${guard2.success ? 'SUCCESS (Refunded 3000)' : 'FAILED: ' + guard2.error}`);

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

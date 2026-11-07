import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres_dev_password@localhost:5439/gym_saas_dev'
});

async function runConcurrencyTest() {
  const clientSetup = await pool.connect();
  let gymId, memberId, subId, payId, userId;
  try {
    const regRes = await clientSetup.query(`SELECT auth_register_user('+919876500099', 'hash', 'Refund Tester') as uid;`);
    userId = regRes.rows[0].uid;
    const gymRes = await clientSetup.query(`SELECT provision_gym($1, 'Concurrency Gym', 'concurr-gym', 'IN', 'Asia/Kolkata', 'INR', 0) as gid;`, [userId]);
    gymId = gymRes.rows[0].gid;

    await clientSetup.query(`SELECT set_config('app.gym_id', $1, false);`, [gymId]);
    await clientSetup.query(`SELECT set_config('app.user_id', $1, false);`, [userId]);

    const planRes = await clientSetup.query(`
      INSERT INTO membership_plans (gym_id, name, duration_days, price_cents)
      VALUES ($1, 'Test Plan', 30, 5000) RETURNING id;
    `, [gymId]);

    const memRes = await clientSetup.query(`
      INSERT INTO members (gym_id, member_number, first_name, last_name, phone)
      VALUES ($1, 'MEM-CONC1', 'Concurrent', 'Member', '+919876500099') RETURNING id;
    `, [gymId]);
    memberId = memRes.rows[0].id;

    const subRes = await clientSetup.query(`
      INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
      VALUES ($1, $2, $3, 'active', CURRENT_DATE, CURRENT_DATE + 30, 5000) RETURNING id;
    `, [gymId, memberId, planRes.rows[0].id]);
    subId = subRes.rows[0].id;

    const receipt = await clientSetup.query(`SELECT generate_next_receipt_number($1) as r;`, [gymId]);
    const payRes = await clientSetup.query(`
      INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
      VALUES ($1, $2, $3, gen_random_uuid(), $4, 'payment', 'cash', 5000, $5) RETURNING id;
    `, [gymId, memberId, subId, receipt.rows[0].r, userId]);
    payId = payRes.rows[0].id;
  } finally {
    clientSetup.release();
  }

  console.log(`Setup complete. Original Payment: 5000 cents (ID: ${payId})`);
  console.log('Dispatching 2 concurrent refund attempts for 3000 cents each (Total: 6000 cents > 5000 cents)...');

  // Attempt two concurrent refunds of 3000 cents each in parallel transactions
  async function attemptRefund(attemptName) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(`SELECT set_config('app.gym_id', $1, true);`, [gymId]);
      await client.query(`SELECT set_config('app.user_id', $1, true);`, [userId]);
      await client.query(`
        INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
        VALUES ($1, $2, gen_random_uuid(), $3, 'refund', 'cash', -3000, $4, $5);
      `, [gymId, memberId, `REC-CONC-${attemptName}`, payId, userId]);
      await client.query('COMMIT;');
      return { attemptName, success: true };
    } catch (err) {
      await client.query('ROLLBACK;');
      return { attemptName, success: false, error: err.message };
    } finally {
      client.release();
    }
  }

  const [res1, res2] = await Promise.all([
    attemptRefund('Thread-A'),
    attemptRefund('Thread-B')
  ]);

  console.log('Concurrent Refund Results:');
  console.log(`- ${res1.attemptName}: ${res1.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + res1.error}`);
  console.log(`- ${res2.attemptName}: ${res2.success ? 'SUCCESS (Refunded 3000 cents)' : 'FAILED: ' + res2.error}`);

  const oneSucceeded = (res1.success && !res2.success) || (!res1.success && res2.success);
  if (oneSucceeded) {
    console.log('CONCURRENCY TEST PASSED: Exactly one transaction succeeded; advisory lock prevented race condition over-refund!');
  } else {
    console.error('CONCURRENCY TEST FAILED: Unexpected outcome!');
    process.exit(1);
  }

  await pool.end();
}

runConcurrencyTest().catch((err) => {
  console.error(err);
  process.exit(1);
});

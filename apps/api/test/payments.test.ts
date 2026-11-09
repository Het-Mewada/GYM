import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import crypto from 'node:crypto';
import type pg from 'pg';

describe('Payments & Invoicing API: Append-Only Ledger, Receipts & Financials', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91961${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91962${Math.floor(1000000 + Math.random() * 9000000)}`;
  const staffPhone = `+91963${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1OwnerToken: string;
  let gym1StaffToken: string;
  let gym1Id: string;

  let gym2OwnerToken: string;
  let gym2Id: string;

  let gym1MemberId: string;
  let gym1PlanId: string;
  let gym1SubId: string;

  let gym2MemberId: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // 1. Setup Gym 1 Owner
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym1Phone, passHash, 'Gym 1 Owner']);
    const u1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym1Phone, password }
    });
    gym1OwnerToken = u1Login.json().accessToken;

    const g1Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        name: 'Iron Forge Fitness',
        slug: `iron-forge-${Date.now()}`,
        taxRateBasisPoints: 1800 // 18% GST
      }
    });
    gym1Id = g1Res.json().gymId;

    // 2. Setup Gym 1 Staff
    const staffUserRes = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [staffPhone, passHash, 'Gym 1 Staff']
    );
    const staffUserId = staffUserRes.rows[0].auth_register_user;

    // Assign staff role in Gym 1
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
    gym1StaffToken = staffLogin.json().accessToken;

    // 3. Setup Gym 2 Owner
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym2Phone, passHash, 'Gym 2 Owner']);
    const u2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: gym2Phone, password }
    });
    gym2OwnerToken = u2Login.json().accessToken;

    const g2Res = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: { name: 'Titan Strength Club', slug: `titan-strength-${Date.now()}` }
    });
    gym2Id = g2Res.json().gymId;

    // 4. Create Member in Gym 1
    const m1Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        firstName: 'Anil',
        lastName: 'Kapoor',
        phone: '+919811122233',
        email: 'anil@example.com'
      }
    });
    gym1MemberId = m1Res.json().member.id;

    // 5. Create Member in Gym 2
    const m2Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/members`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: {
        firstName: 'Sunil',
        phone: '+919822233344'
      }
    });
    gym2MemberId = m2Res.json().member.id;

    // 6. Create Membership Plan in Gym 1 (₹6,000 for 90 days)
    const planRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/plans`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        name: 'Quarterly Fitness Pro',
        durationDays: 90,
        priceCents: 600000
      }
    });
    gym1PlanId = planRes.json().plan.id;

    // 7. Assign Subscription to Anil in Gym 1 (with ₹1,000 discount -> ₹5,000 net)
    const subRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/${gym1MemberId}/subscriptions`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        planId: gym1PlanId,
        discountCents: 100000
      }
    });
    gym1SubId = subRes.json().subscription.id;
  });

  afterAll(async () => {
    if (gym1Id) await cleanupTenant(pool, gym1Id);
    if (gym2Id) await cleanupTenant(pool, gym2Id);
    await app.close();
  });

  let payment1Id: string;
  let payment1ReceiptNumber: string;
  const payment1IdempotencyKey = crypto.randomUUID();

  it('1. records a payment with UPI, tax calculation, and monotonic tax receipt number', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: gym1MemberId,
        subscriptionId: gym1SubId,
        idempotencyKey: payment1IdempotencyKey,
        amountCents: 500000, // ₹5,000.00
        method: 'upi',
        externalReference: 'UPI/1234567890/HDFC',
        notes: 'Full payment via GPay'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.payment).toBeDefined();
    expect(body.isReplay).toBe(false);

    payment1Id = body.payment.id;
    payment1ReceiptNumber = body.payment.receiptNumber;

    expect(payment1ReceiptNumber).toMatch(/^REC-\d{6}-\d{6}$/);
    expect(Number(body.payment.amountCents)).toBe(500000);
    expect(body.payment.method).toBe('upi');
    expect(body.payment.type).toBe('payment');
    expect(body.payment.currency).toBe('INR');

    // Tax calculation: 18% inclusive GST = 500000 * 1800 / (10000 + 1800) = 76271 cents (~₹762.71)
    const expectedTax = Math.round((500000 * 1800) / 11800);
    expect(Number(body.payment.taxCents)).toBe(expectedTax);
  });

  it('2. provides idempotent replay: submitting identical idempotency key returns 200 without duplicate row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: gym1MemberId,
        subscriptionId: gym1SubId,
        idempotencyKey: payment1IdempotencyKey,
        amountCents: 500000,
        method: 'upi'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isReplay).toBe(true);
    expect(body.payment.id).toBe(payment1Id);
    expect(body.payment.receiptNumber).toBe(payment1ReceiptNumber);
  });

  it('3. rejects recording payment for member outside this gym (404 Not Found)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: gym2MemberId, // Member belongs to Gym 2
        idempotencyKey: crypto.randomUUID(),
        amountCents: 100000,
        method: 'cash'
      }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Member not found in this gym');
  });

  it('4. rejects linking payment to a subscription belonging to a different member (404 Not Found)', async () => {
    // Create another member in Gym 1
    const otherMemberRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        firstName: 'Vijay',
        phone: '+919811199988'
      }
    });
    const otherMemberId = otherMemberRes.json().member.id;

    // Attempt to pay for gym1SubId (which belongs to Anil) using Vijay's memberId
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        memberId: otherMemberId,
        subscriptionId: gym1SubId,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 100000,
        method: 'cash'
      }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Subscription not found for this member');
  });

  it('5. lists gym payments with member join, pagination, and filter by member', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/payments?memberId=${gym1MemberId}&limit=10`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` }
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json();
    expect(body.payments.length).toBeGreaterThanOrEqual(1);
    expect(body.total).toBeGreaterThanOrEqual(1);

    const first = body.payments[0];
    expect(first.id).toBe(payment1Id);
    expect(first.memberFirstName).toBe('Anil');
    expect(first.memberLastName).toBe('Kapoor');
    expect(first.memberNumber).toBeDefined();
  });

  it('6. retrieves single payment details by ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.payment.id).toBe(payment1Id);
    expect(body.payment.receiptNumber).toBe(payment1ReceiptNumber);
    expect(body.payment.memberEmail).toBe('anil@example.com');
  });

  let refund1Id: string;
  const refund1IdempotencyKey = crypto.randomUUID();

  it('7. allows owner/manager to issue a partial refund on the payment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}/refund`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        idempotencyKey: refund1IdempotencyKey,
        amountCents: 200000, // Partial refund of ₹2,000 out of ₹5,000
        cancelSubscription: true,
        notes: 'Partial refund requested by member'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.refund).toBeDefined();
    refund1Id = body.refund.id;

    expect(body.refund.type).toBe('refund');
    expect(Math.abs(Number(body.refund.amountCents))).toBe(200000);
    expect(body.refund.parentTransactionId).toBe(payment1Id);
    expect(body.refund.receiptNumber).toContain('-REF');
  });

  it('8. provides idempotent replay on refund endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}/refund`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        idempotencyKey: refund1IdempotencyKey,
        amountCents: 200000
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().isReplay).toBe(true);
    expect(res.json().refund.id).toBe(refund1Id);
  });

  it('9. prevents staff from issuing refunds (403 Forbidden - owner/manager only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}/refund`,
      headers: { authorization: `Bearer ${gym1StaffToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 50000
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Only owners and managers can issue refunds');
  });

  it('10. rejects refund exceeding remaining payment limit via database trigger (409 Conflict)', async () => {
    // Original payment: ₹5,000. Already refunded: ₹2,000. Remaining: ₹3,000.
    // Attempting to refund ₹4,000 exceeds the original payment limit.
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}/refund`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 400000, // ₹4,000 (exceeds ₹3,000 remaining)
        notes: 'Over-refund attempt'
      }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/exceed|validate_refund_limit/i);
  });

  it('11. returns accurate member financial summary and ledger statement', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${gym1MemberId}/financials`,
      headers: { authorization: `Bearer ${gym1OwnerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.member.id).toBe(gym1MemberId);

    // Summary calculation assertions:
    // Total paid: ₹5,000 (500,000 cents)
    expect(body.summary.totalPaidCents).toBe(500000);
    // Total refunded: ₹2,000 (200,000 cents)
    expect(body.summary.totalRefundedCents).toBe(200000);
    // Net paid: ₹3,000 (300,000 cents)
    expect(body.summary.netPaidCents).toBe(300000);
    // Total billed from non-cancelled subscriptions: ₹0 (since subscription was cancelled on refund)
    expect(body.summary.totalBilledCents).toBe(0);
    // Net credit balance: -₹3,000 (-300,000 cents)
    expect(body.summary.balanceCents).toBe(-300000);
    expect(body.summary.isDuesPending).toBe(false);

    // Transactions list contains both original payment and partial refund
    expect(body.transactions).toHaveLength(2);
  });

  it('12. enforces strict cross-tenant isolation: Gym 2 owner cannot view or refund Gym 1 payment', async () => {
    // Attempt 1: Gym 2 owner queries Gym 1 payment URL -> 403 Forbidden
    const getForeignUrlRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/payments/${payment1Id}`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` }
    });
    expect(getForeignUrlRes.statusCode).toBe(403);

    // Attempt 2: Gym 2 owner queries own URL with Gym 1 paymentId -> 404 Not Found
    const getResourceTamperRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/payments/${payment1Id}`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` }
    });
    expect(getResourceTamperRes.statusCode).toBe(404);

    // Attempt 3: Gym 2 owner attempts to refund Gym 1 payment through Gym 2 URL -> 404 Not Found
    const refundTamperRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/payments/${payment1Id}/refund`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` },
      payload: {
        idempotencyKey: crypto.randomUUID(),
        amountCents: 10000
      }
    });
    expect(refundTamperRes.statusCode).toBe(404);

    // Attempt 4: Gym 2 owner queries Gym 1 member financials through Gym 2 URL -> 404 Not Found
    const finTamperRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members/${gym1MemberId}/financials`,
      headers: { authorization: `Bearer ${gym2OwnerToken}` }
    });
    expect(finTamperRes.statusCode).toBe(404);
  });
});

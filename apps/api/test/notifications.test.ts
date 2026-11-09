import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, cleanupTenant } from '@gym/db';
import { hashPassword } from '../src/auth/crypto.js';
import type pg from 'pg';

describe('Notifications System: Resend Email, WhatsApp Direct Links & Audit Logging', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const gym1Phone = `+91961${Math.floor(1000000 + Math.random() * 9000000)}`;
  const gym2Phone = `+91962${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = 'SuperSecurePassword123!';

  let gym1Token: string;
  let gym1Id: string;
  let memberWithEmailId: string;
  let memberWithoutEmailId: string;

  let gym2Token: string;
  let gym2Id: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();

    const passHash = await hashPassword(password);

    // Setup Gym 1
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym1Phone, passHash, 'Notif Gym Owner']);
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
      payload: { name: 'Titan Club Notifications', slug: `titan-notif-${Date.now()}` }
    });
    gym1Id = g1Res.json().gymId;

    // Member with email
    const m1Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Vikram',
        lastName: 'Singhania',
        phone: `+91971${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: 'vikram.singhania@example.com'
      }
    });
    memberWithEmailId = m1Res.json().member.id;

    // Member without email
    const m2Res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        firstName: 'Ananya',
        phone: `+91972${Math.floor(1000000 + Math.random() * 9000000)}`
      }
    });
    memberWithoutEmailId = m2Res.json().member.id;

    // Setup Gym 2
    await pool.query('SELECT auth_register_user($1, $2, $3);', [gym2Phone, passHash, 'Other Owner']);
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
      payload: { name: 'Zenith Fitness', slug: `zenith-${Date.now()}` }
    });
    gym2Id = g2Res.json().gymId;
  });

  afterAll(async () => {
    if (gym1Id) await cleanupTenant(pool, gym1Id);
    if (gym2Id) await cleanupTenant(pool, gym2Id);
    await app.close();
  });

  it('1. dispatches welcome email and records sent log in notification_logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/${memberWithEmailId}/notify`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        channel: 'email',
        template: 'welcome_enrollment',
        customMessage: 'Your key fob is waiting at the front desk.'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.channel).toBe('email');
    expect(body.template).toBe('welcome_enrollment');
    expect(body.status).toBe('sent');
    expect(body.logId).toBeDefined();

    // Verify logged into database
    const notifsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${memberWithEmailId}/notifications`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(notifsRes.statusCode).toBe(200);
    const notifs = notifsRes.json().notifications;
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0].channel).toBe('email');
    expect(notifs[0].template).toBe('welcome_enrollment');
    expect(notifs[0].status).toBe('sent');
  });

  it('2. rejects email dispatch with 400 if member has no email address on file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/${memberWithoutEmailId}/notify`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        channel: 'email',
        template: 'payment_receipt',
        receiptNumber: 'REC-00001',
        amountCents: 500000
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('email');
  });

  it('3. generates valid WhatsApp direct link and logs click event in notification_logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym1Id}/members/${memberWithoutEmailId}/notify`,
      headers: { authorization: `Bearer ${gym1Token}` },
      payload: {
        channel: 'whatsapp_click',
        template: 'payment_receipt',
        receiptNumber: 'REC-00002',
        amountCents: 350000
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.channel).toBe('whatsapp_click');
    expect(body.status).toBe('clicked');
    expect(body.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(body.text).toContain('REC-00002');
    expect(body.text).toContain('₹3,500');

    // Verify WhatsApp link logged in database
    const notifsRes = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/members/${memberWithoutEmailId}/notifications`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(notifsRes.statusCode).toBe(200);
    const notifs = notifsRes.json().notifications;
    expect(notifs.length).toBe(1);
    expect(notifs[0].channel).toBe('whatsapp_click');
    expect(notifs[0].status).toBe('clicked');
  });

  it('4. lists gym-wide notifications with channel filtering and pagination', async () => {
    const resAll = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/notifications`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(resAll.statusCode).toBe(200);
    const all = resAll.json().notifications;
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Filter by channel = 'email'
    const resEmail = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym1Id}/notifications?channel=email`,
      headers: { authorization: `Bearer ${gym1Token}` }
    });
    expect(resEmail.statusCode).toBe(200);
    for (const n of resEmail.json().notifications) {
      expect(n.channel).toBe('email');
    }
  });

  it('5. enforces tenant isolation: Gym 2 cannot notify or view Gym 1 members', async () => {
    // Notify attempt across tenant
    const crossNotify = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gym2Id}/members/${memberWithEmailId}/notify`,
      headers: { authorization: `Bearer ${gym2Token}` },
      payload: {
        channel: 'whatsapp_click',
        template: 'welcome_enrollment'
      }
    });
    expect(crossNotify.statusCode).toBe(404);
    expect(crossNotify.json().error).toContain('Member not found in this gym');

    // View notifications attempt across tenant
    const crossView = await app.inject({
      method: 'GET',
      url: `/api/gyms/${gym2Id}/members/${memberWithEmailId}/notifications`,
      headers: { authorization: `Bearer ${gym2Token}` }
    });
    expect(crossView.statusCode).toBe(404);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool } from '@gym/db';
import type pg from 'pg';

describe('Auth & Session System', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const testPhone = `+91987${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testPassword = 'StrongPassword123!';
  let userId: string;
  let refreshTokenCookie: string;
  let accessToken: string;

  beforeAll(async () => {
    pool = createPool();
    app = buildApp(pool);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. registers a new user with Argon2id password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        phone: testPhone,
        password: testPassword,
        fullName: 'Test Owner'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBeDefined();
    userId = body.userId;
  });

  it('2. logs in with Argon2id verification and receives tokens + HttpOnly cookie', async () => {
    // Negative test: wrong password
    const failRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        phone: testPhone,
        password: 'WrongPassword!'
      }
    });
    expect(failRes.statusCode).toBe(401);

    // Positive test: correct credentials
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        phone: testPhone,
        password: testPassword
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.id).toBe(userId);
    accessToken = body.accessToken;

    // Verify HttpOnly cookie
    const cookies = loginRes.cookies;
    const rfCookie = cookies.find(c => c.name === 'refresh_token');
    expect(rfCookie).toBeDefined();
    expect(rfCookie?.httpOnly).toBe(true);
    expect(rfCookie?.sameSite).toBe('Strict');
    expect(rfCookie?.value).toContain(userId);
    refreshTokenCookie = rfCookie!.value;
  });

  it('3. rotates refresh token on /api/auth/refresh', async () => {
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: `refresh_token=${refreshTokenCookie}`
      }
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.accessToken).toBeDefined();

    // Verify rotated cookie
    const newRfCookie = refreshRes.cookies.find(c => c.name === 'refresh_token');
    expect(newRfCookie).toBeDefined();
    expect(newRfCookie?.value).not.toBe(refreshTokenCookie);

    const oldSpentCookie = refreshTokenCookie;
    const newActiveCookie = newRfCookie!.value;

    // 4. REUSE DETECTION: Presenting the old spent cookie must trigger reuse detection
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: `refresh_token=${oldSpentCookie}`
      }
    });

    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().error).toContain('reuse detected');

    // And now the newly rotated cookie must ALSO be invalidated (entire family revoked)
    const subsequentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: `refresh_token=${newActiveCookie}`
      }
    });
    expect(subsequentRes.statusCode).toBe(401);
  });

  it('5. handles password reset request and completion', async () => {
    // Request reset
    const reqRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { phone: testPhone }
    });
    expect(reqRes.statusCode).toBe(200);
    const debugToken = reqRes.json().debugToken;
    expect(debugToken).toBeDefined();

    // Complete reset
    const newPassword = 'BrandNewPassword999!';
    const compRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/complete',
      payload: {
        token: debugToken,
        newPassword
      }
    });
    expect(compRes.statusCode).toBe(200);

    // Verify login with new password succeeds
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        phone: testPhone,
        password: newPassword
      }
    });
    expect(loginRes.statusCode).toBe(200);
  });
});

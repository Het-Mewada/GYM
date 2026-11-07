import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Fastify API Test Harness', () => {
  it('responds with status ok on /health', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gym-api');
    await app.close();
  });
});

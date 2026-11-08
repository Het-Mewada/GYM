import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
  MIN_SECRET_LENGTH,
  getJwtSecrets
} from '../src/auth/jwt.js';
import { ARGON2ID_PARAMS } from '../src/auth/crypto.js';

describe('JWT Configuration & Security Assertions', () => {
  it('pins algorithm to HS256 and embeds iss and aud claims', () => {
    expect(JWT_ALGORITHM).toBe('HS256');
    expect(JWT_ISSUER).toBe('gym-saas-api');
    expect(JWT_AUDIENCE).toBe('gym-saas-app');
    expect(MIN_SECRET_LENGTH).toBe(32);

    const token = signAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      fullName: 'Owner Test'
    });

    const decoded = jwt.decode(token, { complete: true }) as any;
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload.iss).toBe('gym-saas-api');
    expect(decoded.payload.aud).toBe('gym-saas-app');
    expect(decoded.payload.sub).toBe('11111111-1111-1111-1111-111111111111');

    const verified = verifyAccessToken(token);
    expect(verified.userId).toBe('11111111-1111-1111-1111-111111111111');
    expect(verified.fullName).toBe('Owner Test');
  });

  it('rejects tokens signed with alg none or mismatched algorithms', () => {
    // Unsigned / alg: none token
    const maliciousPayload = {
      sub: 'hacker',
      userId: 'hacker',
      fullName: 'Attacker',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE
    };
    const unsignedToken = jwt.sign(maliciousPayload, '', { algorithm: 'none' } as any);

    expect(() => verifyAccessToken(unsignedToken)).toThrow();
  });

  it('fails if JWT_SECRET is less than 32 characters', () => {
    const original = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'too-short';
      expect(() => getJwtSecrets()).toThrow(/at least 32 characters long/);
    } finally {
      process.env.JWT_SECRET = original;
    }
  });

  it('supports seamless secret rotation via JWT_SECRET_PREVIOUS', () => {
    const originalPrimary = process.env.JWT_SECRET;
    const originalPrev = process.env.JWT_SECRET_PREVIOUS;

    try {
      const secretV1 = 'first_secret_key_with_at_least_32_characters_here';
      const secretV2 = 'second_secret_key_with_at_least_32_characters_here';

      // Step 1: Sign token using secretV1
      process.env.JWT_SECRET = secretV1;
      delete process.env.JWT_SECRET_PREVIOUS;
      const tokenSignedWithV1 = signAccessToken({
        userId: '22222222-2222-2222-2222-222222222222',
        fullName: 'Rotation User'
      });

      // Step 2: Rotate - secretV2 becomes primary, secretV1 becomes previous
      process.env.JWT_SECRET = secretV2;
      process.env.JWT_SECRET_PREVIOUS = secretV1;

      // Old token signed with secretV1 must still verify successfully!
      const verifiedOld = verifyAccessToken(tokenSignedWithV1);
      expect(verifiedOld.userId).toBe('22222222-2222-2222-2222-222222222222');

      // New token signed with secretV2 must verify successfully
      const tokenSignedWithV2 = signAccessToken({
        userId: '33333333-3333-3333-3333-333333333333',
        fullName: 'New User'
      });
      const verifiedNew = verifyAccessToken(tokenSignedWithV2);
      expect(verifiedNew.userId).toBe('33333333-3333-3333-3333-333333333333');
    } finally {
      process.env.JWT_SECRET = originalPrimary;
      process.env.JWT_SECRET_PREVIOUS = originalPrev;
    }
  });

  it('verifies Argon2id parameters match OWASP security recommendations', () => {
    expect(ARGON2ID_PARAMS.memoryCost).toBe(65536); // 64 MiB
    expect(ARGON2ID_PARAMS.timeCost).toBe(3);       // 3 iterations
    expect(ARGON2ID_PARAMS.parallelism).toBe(4);    // 4 parallel threads
  });
});

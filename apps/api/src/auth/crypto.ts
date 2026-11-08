import { hash, verify } from '@node-rs/argon2';
import crypto from 'node:crypto';

export const ARGON2ID_PARAMS = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4     // 4 threads
} as const;

// Precomputed valid Argon2id hash with identical parameters (64MB, 3 iterations, 4 parallelism)
// Used when an unknown phone number attempts login so verifyPassword executes the exact same
// ~70ms cryptographic workload, preventing timing-based user enumeration.
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$Ko4Zyg1CKwNwcfzDp6YM+g$/1ij6iyb1jVYCogc57uc+CA7QKgSnCop2yvlcjs8b0Y';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_PARAMS);
}

export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password);
  } catch {
    return false;
  }
}

export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

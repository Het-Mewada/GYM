import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Concurrency & Race Condition Verification Suite', () => {
  it('executes refund concurrency test with control race and guarded run', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const output = execSync('node scripts/test_refund_concurrency_v5.mjs', {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: process.env
    });

    expect(output).toContain('CONFIRMED: Without pg_advisory_xact_lock, race condition occurs');
    expect(output).toContain('SUCCESS: Two-key advisory lock serialized the transactions');
    expect(output).toContain('Result of Control Run: Total Refunded = 6000 cents against 5000 cents parent');
    expect(output).toContain('Result of Guarded Run: Total Refunded = 3000 cents against 5000 cents parent');
  });

  it('executes overlap concurrency test with control race and guarded run', () => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const output = execSync('node scripts/test_overlap_concurrency.mjs', {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: process.env
    });

    expect(output).toContain('CONFIRMED: Without pg_advisory_xact_lock, race condition occurs');
    expect(output).toContain('SUCCESS: Two-key advisory lock serialized the transactions');
    expect(output).toContain('Result of Control Run: Total active overlapping subscriptions = 2');
    expect(output).toContain('Result of Guarded Run: Total active subscriptions = 1');
  });
});

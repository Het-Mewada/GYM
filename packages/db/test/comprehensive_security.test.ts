import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Comprehensive Database Security & Isolation Suite', () => {
  it('executes full SQL verification test suite (negative tests, cross-tenant call rejections, role isolation, refund semantics)', () => {
    const scriptPath = path.resolve(__dirname, '../../../scripts/test_v5_comprehensive.sql');
    const sqlContent = fs.readFileSync(scriptPath);

    const result = spawnSync(
      'docker',
      ['exec', '-i', 'gym-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'gym_saas_dev'],
      {
        input: sqlContent,
        encoding: 'utf-8'
      }
    );

    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;

    if (result.status !== 0) {
      throw new Error(`SQL test execution failed with exit code ${result.status}:\n${combinedOutput}`);
    }

    expect(combinedOutput).toContain('SUCCESS: provision_gym rejected mismatched owner');
    expect(combinedOutput).toContain('SUCCESS: claim_staff_invitation rejected mismatched user');
    expect(combinedOutput).toContain('SUCCESS: app_user denied access to _generate_next_receipt_number_internal');
    expect(combinedOutput).toContain('SUCCESS: SELECT users.password_hash rejected with insufficient_privilege.');
    expect(combinedOutput).toContain('SUCCESS: UPDATE payment_transactions rejected with insufficient_privilege.');
    expect(combinedOutput).toContain('SUCCESS: UPDATE tenants rejected with insufficient_privilege.');
    expect(combinedOutput).toContain('SUCCESS: DELETE audit_logs rejected with insufficient_privilege.');
    expect(combinedOutput).toContain('SUCCESS: void_attendance_record rejected for staff role');
    expect(combinedOutput).toContain('SUCCESS: Refund on active subscription rejected without price adjustment');
    expect(combinedOutput).toContain('SUCCESS: UPDATE on subscription_adjustments rejected');
    expect(combinedOutput).toContain('SUCCESS: Refund on pending subscription rejected');
    expect(combinedOutput).toContain('SUCCESS: check_days_frozen_match rejected mismatched days_frozen');
    expect(combinedOutput).toContain('SUCCESS: Overlap caught on pending -> active transition');
  });
});

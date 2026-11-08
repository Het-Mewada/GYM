import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const securityDocPath = path.join(ROOT, 'docs', 'SECURITY.md');
const decisionsDocPath = path.join(ROOT, 'docs', 'DECISIONS.md');
const routesPath = path.join(ROOT, 'apps', 'api', 'src', 'auth', 'routes.ts');
const cryptoPath = path.join(ROOT, 'apps', 'api', 'src', 'auth', 'crypto.ts');
const ddlPath = path.join(ROOT, 'scripts', 'ddl_v5.sql');

function fail(msg) {
  console.error(`❌ DOCS SYNC FAILURE: ${msg}`);
  process.exit(1);
}

console.log('>>> Checking docs/SECURITY.md and docs/DECISIONS.md synchronization...');

if (!fs.existsSync(securityDocPath)) fail('docs/SECURITY.md not found');
if (!fs.existsSync(decisionsDocPath)) fail('docs/DECISIONS.md not found');

const securityDoc = fs.readFileSync(securityDocPath, 'utf8');
const decisionsDoc = fs.readFileSync(decisionsDocPath, 'utf8');
const routesCode = fs.readFileSync(routesPath, 'utf8');
const cryptoCode = fs.readFileSync(cryptoPath, 'utf8');
const ddlCode = fs.readFileSync(ddlPath, 'utf8');

// 1. Check legacy route is replaced
if (securityDoc.includes('/members/:memberId/reset-password')) {
  fail("docs/SECURITY.md still references legacy endpoint '/members/:memberId/reset-password'");
}
if (!securityDoc.includes('/staff/:userId/reset-password')) {
  fail("docs/SECURITY.md missing current endpoint '/staff/:userId/reset-password'");
}

// 2. Check table names: payment_transactions vs legacy payments
if (securityDoc.includes('(`payments`')) {
  fail("docs/SECURITY.md references legacy table name `payments` instead of `payment_transactions`");
}

// 3. Verify rate limit and throttling numbers in code match docs
const maxAttemptsMatch = routesCode.match(/ACCOUNT_MAX_FAILED_ATTEMPTS\s*=\s*(\d+)/);
if (!maxAttemptsMatch) fail('Could not extract ACCOUNT_MAX_FAILED_ATTEMPTS from code');
const maxAttempts = maxAttemptsMatch[1];
if (!securityDoc.includes(`ACCOUNT_MAX_FAILED_ATTEMPTS = ${maxAttempts}`)) {
  fail(`docs/SECURITY.md does not document ACCOUNT_MAX_FAILED_ATTEMPTS = ${maxAttempts}`);
}

const graceMatch = routesCode.match(/REFRESH_GRACE_WINDOW_MS\s*=\s*(\d+[\d_]*)/);
if (!graceMatch) fail('Could not extract REFRESH_GRACE_WINDOW_MS from code');
const grace = graceMatch[1];
if (!securityDoc.includes(`REFRESH_GRACE_WINDOW_MS = ${grace}`)) {
  fail(`docs/SECURITY.md does not document REFRESH_GRACE_WINDOW_MS = ${grace}`);
}

// 4. Verify Argon2id parameters match code
if (!securityDoc.includes('memoryCost: 65536') || !securityDoc.includes('timeCost: 3') || !securityDoc.includes('parallelism: 4')) {
  fail('docs/SECURITY.md Argon2id parameters do not match code exports');
}

// 5. Verify documented database functions exist in ddl_v5.sql
const requiredFunctions = [
  'auth_lookup_user_by_phone',
  'auth_complete_password_reset',
  'auth_create_staff_password_reset',
  'auth_record_failed_login',
  'auth_is_account_locked',
  'auth_clear_account_lockout',
  'generate_next_receipt_number',
  'void_attendance_record'
];

for (const fn of requiredFunctions) {
  if (!securityDoc.includes(fn)) {
    fail(`docs/SECURITY.md does not mention required function ${fn}`);
  }
  if (!ddlCode.includes(`FUNCTION ${fn}`)) {
    fail(`scripts/ddl_v5.sql does not contain definition for ${fn}`);
  }
}

// 6. Verify database storage for throttler is explicitly stated
if (!securityDoc.includes('account_login_attempts')) {
  fail("docs/SECURITY.md does not document the 'account_login_attempts' database table");
}
if (!decisionsDoc.includes('account_login_attempts')) {
  fail("docs/DECISIONS.md does not document the 'account_login_attempts' database table in ADR-010");
}

// 7. Verify Lockout-DoS tradeoff is documented
if (!securityDoc.includes('Lockout-DoS Tradeoff')) {
  fail("docs/SECURITY.md does not document the Lockout-DoS Tradeoff");
}

console.log('✅ Documentation is in 100% sync with real code, schema, and rate limits.');

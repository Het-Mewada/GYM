#!/usr/bin/env bash
# ==============================================================================
# MASTER RE-CREATION & VERIFICATION SCRIPT (DDL v5 & END-TO-END SUITE)
# Runs from clean docker compose down -v
# ==============================================================================

set -euo pipefail

mkdir -p docs/verification
master_log="docs/verification/00_master_recreate_and_test.log"
echo "=== START OF RECREATE_AND_TEST RUN $(date -u +"%Y-%m-%dT%H:%M:%SZ") ===" > "$master_log"

log() {
    echo -e "$1" | tee -a "$master_log"
}

log ">>> STEP 1: Full Teardown (docker compose down -v)"
docker compose down -v 2>&1 | tee -a "$master_log"

log "\n>>> STEP 2: Full Startup (docker compose up -d --build)"
docker compose up -d --build 2>&1 | tee -a "$master_log"

log "\n>>> STEP 3: Awaiting PostgreSQL Health Check"
retries=30
while [ $retries -gt 0 ]; do
    status=$(docker inspect --format="{{.State.Health.Status}}" gym-postgres 2>/dev/null || true)
    if [ "$status" = "healthy" ]; then
        log "PostgreSQL container is HEALTHY!"
        break
    fi
    log "Waiting for postgres healthcheck... ($retries remaining)"
    sleep 2
    retries=$((retries - 1))
done

if [ $retries -eq 0 ]; then
    log "ERROR: PostgreSQL failed to become healthy in time."
    log "=== RUN TERMINATED WITH FAILURE - EXIT CODE: 1 ==="
    exit 1
fi

log "\n>>> STEP 4: Applying DDL v5 to PostgreSQL 16"
docker exec -i gym-postgres psql -U postgres -d gym_saas_dev < scripts/ddl_v5.sql | tee docs/verification/02_schema_apply_v5.log | tee -a "$master_log"
docker exec -i gym-postgres psql -U postgres -d gym_saas_dev < scripts/seed_demo_user.sql | tee -a "$master_log"

log "\n>>> STEP 5: Executing Catalog Tests (Must all return 0 rows)"
docker exec -i gym-postgres psql -U postgres -d gym_saas_dev -c "
-- Catalog Test 1: Every table with gym_id has FORCE ROW LEVEL SECURITY
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE a.attname = 'gym_id'
  AND c.relkind = 'r'
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

-- Catalog Test 2: Every table with gym_id has an active RLS policy
SELECT c.relname
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE a.attname = 'gym_id'
  AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

-- Catalog Test 3: Every FK pointing to a tenant table is composite and includes gym_id
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid::regclass::text IN ('members', 'subscriptions', 'payment_transactions', 'membership_plans', 'subscription_adjustments')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(conkey) k
    JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
    WHERE a.attname = 'gym_id'
  );
" | tee docs/verification/03_catalog_tests.log | tee -a "$master_log"

log "\n>>> STEP 6: Executing Comprehensive Test Suite (Isolation, Roles, Guards, Worklists)"
docker exec -i gym-postgres psql -U postgres -d gym_saas_dev < scripts/test_v5_comprehensive.sql | tee docs/verification/04_isolation_and_guards.log | tee -a "$master_log"

log "\n>>> STEP 7: Executing Refund Concurrency Test with Control Race Run"
node scripts/test_refund_concurrency_v5.mjs | tee docs/verification/05_refund_concurrency_with_control.log | tee -a "$master_log"

log "\n>>> STEP 8: Executing Overlap Concurrency Test with Control Race Run"
node scripts/test_overlap_concurrency.mjs | tee docs/verification/06_overlap_concurrency_with_control.log | tee -a "$master_log"

log "\n>>> STEP 9: Testing Live Container Health Endpoints (API + Web)"
api_retries=20
while [ $api_retries -gt 0 ]; do
    if curl -s -f http://127.0.0.1:4000/health > /dev/null; then
        log "API container is HEALTHY and listening!"
        break
    fi
    log "Waiting for API service to respond... ($api_retries remaining)"
    sleep 2
    api_retries=$((api_retries - 1))
done

web_retries=20
while [ $web_retries -gt 0 ]; do
    if curl -s -f http://127.0.0.1:3000/api/health > /dev/null; then
        log "Web container is HEALTHY and listening!"
        break
    fi
    log "Waiting for Web service to respond... ($web_retries remaining)"
    sleep 2
    web_retries=$((web_retries - 1))
done

{
    echo "--- API Container Health (http://127.0.0.1:4000/health) ---"
    curl -s http://127.0.0.1:4000/health
    echo -e "\n--- Web Container Health (http://127.0.0.1:3000/api/health) ---"
    curl -s http://127.0.0.1:3000/api/health
    echo ""
} | tee docs/verification/07_health_checks.log | tee -a "$master_log"

log "\n>>> STEP 10: Executing Vitest Test Suites (API, DB, Auth, Cross-Tenant, Drift, Concurrency, Route Registry, JWT)"
pnpm exec turbo run test --force | tee docs/verification/08_vitest_suites.log | tee -a "$master_log"

log "\n>>> ALL VERIFICATION STEPS COMPLETED SUCCESSFULLY - EXIT CODE: 0"
log "=== END OF RECREATE_AND_TEST RUN $(date -u +"%Y-%m-%dT%H:%M:%SZ") - EXIT CODE: 0 ==="

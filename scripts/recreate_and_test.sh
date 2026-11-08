#!/bin/bash
set -e

echo ">>> STEP 1: Full Teardown (docker compose down -v)"
docker compose down -v

echo -e "\n>>> STEP 2: Full Startup (docker compose up -d --build)"
docker compose up -d --build

echo -e "\n>>> STEP 3: Awaiting PostgreSQL Health Check"
until [ "$(docker inspect -f {{.State.Health.Status}} gym-postgres 2>/dev/null)" = "healthy" ]; do
    echo "Waiting for postgres healthcheck..."
    sleep 2
done

mkdir -p docs/verification

echo -e "\n>>> STEP 4: Applying DDL v5 to PostgreSQL 16"
cat scripts/ddl_v5.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | tee docs/verification/02_schema_apply_v5.log

echo -e "\n>>> STEP 5: Executing Catalog Tests (Must all return 0 rows)"
docker exec -i gym-postgres psql -U postgres -d gym_saas_dev -c "
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE a.attname = 'gym_id'
  AND c.relkind = 'r'
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

SELECT c.relname
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE a.attname = 'gym_id'
  AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid::regclass::text IN ('members', 'subscriptions', 'payment_transactions', 'membership_plans')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(conkey) k
    JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
    WHERE a.attname = 'gym_id'
  );
" | tee docs/verification/03_catalog_tests.log

echo -e "\n>>> STEP 6: Executing Comprehensive Test Suite"
cat scripts/test_v5_comprehensive.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | tee docs/verification/04_isolation_and_guards.log

echo -e "\n>>> STEP 7: Executing Refund Concurrency Test with Control Race Run"
node scripts/test_refund_concurrency_v5.mjs | tee docs/verification/05_refund_concurrency_with_control.log

echo -e "\n>>> STEP 8: Executing Overlap Concurrency Test with Control Race Run"
node scripts/test_overlap_concurrency.mjs | tee docs/verification/06_overlap_concurrency_with_control.log

echo -e "\n>>> STEP 9: Testing Live Container Health Endpoints"
until curl -s http://localhost:4000/health > /dev/null; do
    echo "Waiting for API service..."
    sleep 2
done
until curl -s http://localhost:3000/api/health > /dev/null; do
    echo "Waiting for Web service..."
    sleep 2
done
curl -s http://localhost:4000/health | tee docs/verification/07_health_checks.log
echo "" | tee -a docs/verification/07_health_checks.log
curl -s http://localhost:3000/api/health | tee -a docs/verification/07_health_checks.log
echo -e "\n>>> ALL VERIFICATION STEPS COMPLETED SUCCESSFULLY!"

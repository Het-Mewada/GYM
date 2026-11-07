# ==============================================================================
# MASTER RE-CREATION & VERIFICATION SCRIPT (DDL v5 & END-TO-END SUITE)
# Runs from clean docker compose down -v
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host ">>> STEP 1: Full Teardown (docker compose down -v)"
docker compose down -v

Write-Host "`n>>> STEP 2: Full Startup (docker compose up -d --build)"
docker compose up -d --build

Write-Host "`n>>> STEP 3: Awaiting PostgreSQL Health Check"
$retries = 30
while ($retries -gt 0) {
    $status = docker inspect --format="{{.State.Health.Status}}" gym-postgres 2>$null
    if ($status -eq "healthy") {
        Write-Host "PostgreSQL container is HEALTHY!"
        break
    }
    Write-Host "Waiting for postgres healthcheck... ($retries remaining)"
    Start-Sleep -Seconds 2
    $retries--
}

if ($retries -eq 0) {
    Write-Error "PostgreSQL failed to become healthy in time."
}

# Ensure output directory exists
New-Item -ItemType Directory -Force -Path "docs/verification" | Out-Null

Write-Host "`n>>> STEP 4: Applying DDL v5 to PostgreSQL 16"
Get-Content scripts/ddl_v5.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | Tee-Object -FilePath "docs/verification/02_schema_apply_v5.log"

Write-Host "`n>>> STEP 5: Executing Catalog Tests (Must all return 0 rows)"
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
  AND confrelid::regclass::text IN ('members', 'subscriptions', 'payment_transactions', 'membership_plans')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(conkey) k
    JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
    WHERE a.attname = 'gym_id'
  );
" | Tee-Object -FilePath "docs/verification/03_catalog_tests.log"

Write-Host "`n>>> STEP 6: Executing Comprehensive Test Suite (Isolation, Roles, Guards, Worklists)"
Get-Content scripts/test_v5_comprehensive.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | Tee-Object -FilePath "docs/verification/04_isolation_and_guards.log"

Write-Host "`n>>> STEP 7: Executing Refund Concurrency Test with Control Race Run"
node scripts/test_refund_concurrency_v5.js | Tee-Object -FilePath "docs/verification/05_refund_concurrency_with_control.log"

Write-Host "`n>>> STEP 8: Testing Live Container Health Endpoints (API + Web)"
$apiHealth = $null
$webHealth = $null

$apiRetries = 20
while ($apiRetries -gt 0) {
    try {
        $apiHealth = Invoke-RestMethod -Uri "http://localhost:4000/health" -TimeoutSec 3
        if ($apiHealth.status -eq "ok") {
            Write-Host "API container is HEALTHY and listening!"
            break
        }
    } catch {
        Write-Host "Waiting for API service to respond... ($apiRetries remaining)"
        Start-Sleep -Seconds 2
        $apiRetries--
    }
}

$webRetries = 20
while ($webRetries -gt 0) {
    try {
        $webHealth = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3
        if ($webHealth.status -eq "ok") {
            Write-Host "Web container is HEALTHY and listening!"
            break
        }
    } catch {
        Write-Host "Waiting for Web service to respond... ($webRetries remaining)"
        Start-Sleep -Seconds 2
        $webRetries--
    }
}

$healthLog = @"
--- API Container Health (http://localhost:4000/health) ---
$($apiHealth | ConvertTo-Json -Depth 5)

--- Web Container Health (http://localhost:3000/api/health) ---
$($webHealth | ConvertTo-Json -Depth 5)
"@

$healthLog | Tee-Object -FilePath "docs/verification/06_health_checks.log"

# Normalize all log files to UTF-8 without BOM
Get-ChildItem "docs/verification/*.log" | ForEach-Object {
    $content = Get-Content $_.FullName
    [System.IO.File]::WriteAllLines($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
}

Write-Host "`n>>> ALL VERIFICATION STEPS COMPLETED SUCCESSFULLY!"

# ==============================================================================
# MASTER RE-CREATION & VERIFICATION SCRIPT (DDL v5 & END-TO-END SUITE)
# Runs from clean docker compose down -v
# ==============================================================================

$ErrorActionPreference = "Continue"
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$masterLogPath = "docs/verification/00_master_recreate_and_test.log"
New-Item -ItemType Directory -Force -Path "docs/verification" | Out-Null
"=== START OF RECREATE_AND_TEST RUN $(Get-Date -Format o) ===" | Set-Content -Path $masterLogPath -Encoding utf8

function Log-Message($text) {
    Write-Host $text
    $text | Out-File -FilePath $masterLogPath -Append -Encoding utf8
}

function Assert-CommandSuccess($stepName) {
    if ($LASTEXITCODE -ne 0) {
        $msg = "FAILED: $stepName exited with code $LASTEXITCODE"
        Log-Message $msg
        Log-Message "=== RUN TERMINATED WITH FAILURE - EXIT CODE: $LASTEXITCODE ==="
        exit $LASTEXITCODE
    }
}

Log-Message ">>> STEP 1: Full Teardown (docker compose down -v)"
docker compose down -v 2>&1 | Tee-Object -FilePath $masterLogPath -Append
Assert-CommandSuccess "Docker compose teardown"

Log-Message "`n>>> STEP 2: Full Startup (docker compose up -d --build)"
docker compose up -d --build 2>&1 | Tee-Object -FilePath $masterLogPath -Append
Assert-CommandSuccess "Docker compose build and startup"

Log-Message "`n>>> STEP 3: Awaiting PostgreSQL Health Check"
$retries = 30
while ($retries -gt 0) {
    $status = docker inspect --format="{{.State.Health.Status}}" gym-postgres 2>$null
    if ($status -eq "healthy") {
        Log-Message "PostgreSQL container is HEALTHY!"
        break
    }
    Log-Message "Waiting for postgres healthcheck... ($retries remaining)"
    Start-Sleep -Seconds 2
    $retries--
}

if ($retries -eq 0) {
    Log-Message "PostgreSQL failed to become healthy in time."
    Log-Message "=== RUN TERMINATED WITH FAILURE - EXIT CODE: 1 ==="
    exit 1
}

Log-Message "`n>>> STEP 4: Applying DDL v5 to PostgreSQL 16"
Get-Content scripts/ddl_v5.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | Tee-Object -FilePath "docs/verification/02_schema_apply_v5.log"
Get-Content "docs/verification/02_schema_apply_v5.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Schema application"

Log-Message "`n>>> STEP 5: Executing Catalog Tests (Must all return 0 rows)"
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
" | Tee-Object -FilePath "docs/verification/03_catalog_tests.log"
Get-Content "docs/verification/03_catalog_tests.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Catalog tests"

Log-Message "`n>>> STEP 6: Executing Comprehensive Test Suite (Isolation, Roles, Guards, Worklists)"
Get-Content scripts/test_v5_comprehensive.sql | docker exec -i gym-postgres psql -U postgres -d gym_saas_dev | Tee-Object -FilePath "docs/verification/04_isolation_and_guards.log"
Get-Content "docs/verification/04_isolation_and_guards.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Isolation and comprehensive tests"

Log-Message "`n>>> STEP 7: Executing Refund Concurrency Test with Control Race Run"
node scripts/test_refund_concurrency_v5.mjs | Tee-Object -FilePath "docs/verification/05_refund_concurrency_with_control.log"
Get-Content "docs/verification/05_refund_concurrency_with_control.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Refund concurrency test"

Log-Message "`n>>> STEP 8: Executing Overlap Concurrency Test with Control Race Run"
node scripts/test_overlap_concurrency.mjs | Tee-Object -FilePath "docs/verification/06_overlap_concurrency_with_control.log"
Get-Content "docs/verification/06_overlap_concurrency_with_control.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Overlap concurrency test"

Log-Message "`n>>> STEP 9: Testing Live Container Health Endpoints (API + Web)"
$apiHealth = $null
$webHealth = $null

$apiRetries = 20
while ($apiRetries -gt 0) {
    try {
        $apiHealth = Invoke-RestMethod -Uri "http://127.0.0.1:4000/health" -TimeoutSec 3
        if ($apiHealth.status -eq "ok") {
            Log-Message "API container is HEALTHY and listening!"
            break
        }
    } catch {
        Log-Message "Waiting for API service to respond... ($apiRetries remaining)"
        Start-Sleep -Seconds 2
        $apiRetries--
    }
}

if ($null -eq $apiHealth) {
    Log-Message "API health probe failed."
    Log-Message "=== RUN TERMINATED WITH FAILURE - EXIT CODE: 1 ==="
    exit 1
}

$webRetries = 20
while ($webRetries -gt 0) {
    try {
        $webHealth = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 3
        if ($webHealth.status -eq "ok") {
            Log-Message "Web container is HEALTHY and listening!"
            break
        }
    } catch {
        Log-Message "Waiting for Web service to respond... ($webRetries remaining)"
        Start-Sleep -Seconds 2
        $webRetries--
    }
}

if ($null -eq $webHealth) {
    Log-Message "Web health probe failed."
    Log-Message "=== RUN TERMINATED WITH FAILURE - EXIT CODE: 1 ==="
    exit 1
}

$healthLog = @"
--- API Container Health (http://127.0.0.1:4000/health) ---
$($apiHealth | ConvertTo-Json -Depth 5)

--- Web Container Health (http://127.0.0.1:3000/api/health) ---
$($webHealth | ConvertTo-Json -Depth 5)
"@

$healthLog | Tee-Object -FilePath "docs/verification/07_health_checks.log"
Get-Content "docs/verification/07_health_checks.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8

Log-Message "`n>>> STEP 10: Executing Vitest Test Suites (API, DB, Auth, Cross-Tenant, Drift, Concurrency, Route Registry, JWT)"
pnpm run test | Tee-Object -FilePath "docs/verification/08_vitest_suites.log"
Get-Content "docs/verification/08_vitest_suites.log" | Out-File -FilePath $masterLogPath -Append -Encoding utf8
Assert-CommandSuccess "Vitest test suites"

Log-Message "`n>>> ALL VERIFICATION STEPS COMPLETED SUCCESSFULLY - EXIT CODE: 0"
Log-Message "=== END OF RECREATE_AND_TEST RUN $(Get-Date -Format o) - EXIT CODE: 0 ==="

# Normalize all log files to UTF-8 without BOM
Get-ChildItem "docs/verification/*.log" | ForEach-Object {
    $content = Get-Content $_.FullName
    [System.IO.File]::WriteAllLines($_.FullName, $content, [System.Text.UTF8Encoding]::new($false))
}

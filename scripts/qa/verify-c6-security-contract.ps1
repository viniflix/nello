param(
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container = 'nello_clinical_attachments_test'
$migration = Join-Path $root 'supabase\migrations\20260813020400_c6_security_definer_acl_contract.sql'
$matrix = Join-Path $root 'supabase\tests\c6_security_definer_allowlist_matrix.sql'

foreach ($file in @($migration, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required C6.0 artifact is missing: $file"
    }
}

try {
    & (Join-Path $PSScriptRoot 'verify-s02-supabase-hardening.ps1') -KeepContainer
    if ($LASTEXITCODE -ne 0) { throw 'S0.2 prerequisite matrix failed.' }

    docker cp $migration "${container}:/tmp/c6-security-contract-migration.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/c6-security-contract.sql" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 `
        -U supabase_admin -d postgres -f /tmp/c6-security-contract-migration.sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'C6.0 security contract migration failed.' }

    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 `
        -U supabase_admin -d postgres -f /tmp/c6-security-contract.sql
    if ($LASTEXITCODE -ne 0) { throw 'C6.0 security contract matrix failed.' }

    Write-Output 'C6.0 SECURITY DEFINER allowlist and guard contract approved.'
}
finally {
    if (-not $KeepContainer) { docker rm -f $container 2>$null | Out-Null }
}

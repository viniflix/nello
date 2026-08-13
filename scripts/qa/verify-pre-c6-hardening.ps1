param(
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container = 'nello_clinical_attachments_test'
$migration = Join-Path $root 'supabase\migrations\20260806010000_pre_c6_security_hardening.sql'
$matrix = Join-Path $root 'supabase\tests\pre_c6_security_hardening_matrix.sql'

foreach ($file in @($migration, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required pre-C6 artifact is missing: $file" }
}

try {
    & (Join-Path $PSScriptRoot 'verify-clinical-attachments.ps1') -KeepContainer
    if ($LASTEXITCODE -ne 0) { throw 'C5 prerequisite matrix failed.' }

    docker cp $migration "${container}:/tmp/pre-c6.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/pre-c6-matrix.sql" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/pre-c6.sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Pre-C6 migration failed in the disposable database.' }
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/pre-c6-matrix.sql
    if ($LASTEXITCODE -ne 0) { throw 'Pre-C6 security matrix failed.' }

    Write-Output 'Pre-C6 notification, photo privacy, episode isolation and immutable audit matrix approved.'
}
finally {
    if (-not $KeepContainer) { docker rm -f $container 2>$null | Out-Null }
}

param(
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container = 'nello_clinical_attachments_test'
$migration = Join-Path $root 'supabase\migrations\20260813021000_c6_document_identity_foundation.sql'
$matrix = Join-Path $root 'supabase\tests\c6_document_identity_matrix.sql'

foreach ($file in @($migration, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required C6.1 artifact is missing: $file"
    }
}

try {
    & (Join-Path $PSScriptRoot 'verify-c6-security-contract.ps1') -KeepContainer
    if ($LASTEXITCODE -ne 0) { throw 'C6.0 prerequisite matrix failed.' }

    docker cp $migration "${container}:/tmp/c6-document-identity.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/c6-document-identity-matrix.sql" | Out-Null

    docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 `
        -U supabase_admin -d postgres -f /tmp/c6-document-identity.sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'C6.1 document identity migration failed.' }

    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 `
        -U supabase_admin -d postgres -f /tmp/c6-document-identity-matrix.sql
    if ($LASTEXITCODE -ne 0) { throw 'C6.1 document identity matrix failed.' }

    Write-Output 'C6.1 versioned document identity, authoritative CRN and negative-role matrix approved.'
}
finally {
    if (-not $KeepContainer) { docker rm -f $container 2>$null | Out-Null }
}

param(
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container = 'nello_clinical_attachments_test'
$bridgeMigrationNames = @(
    '20260728123000_restore_prelaunch_tester_clinical_access.sql',
    '20260730230000_align_meal_plan_permissions_with_care_episodes.sql',
    '20260802203000_harden_meal_plan_time_validation.sql',
    '20260802210000_add_clinical_attachment_lifecycle.sql',
    '20260802220000_add_patient_clinical_document_projection.sql',
    '20260803011500_stabilize_patient_background_jobs.sql',
    '20260803031500_tolerate_legacy_meal_times.sql',
    '20260803050000_remove_empty_patient_safely.sql',
    '20260803051000_fix_empty_patient_link_status.sql',
    '20260803052000_allow_ended_patient_links.sql',
    '20260805234000_stabilize_notifications_for_offline_patients.sql'
)
$bridgeMigrations = $bridgeMigrationNames | ForEach-Object {
    Join-Path $root "supabase\migrations\$_"
}
$migration = Join-Path $root 'supabase\migrations\20260806010000_pre_c6_security_hardening.sql'
$matrix = Join-Path $root 'supabase\tests\pre_c6_security_hardening_matrix.sql'

foreach ($file in @($bridgeMigrations) + @($migration, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required pre-C6 artifact is missing: $file" }
}

try {
    & (Join-Path $PSScriptRoot 'verify-clinical-attachments.ps1') -KeepContainer
    if ($LASTEXITCODE -ne 0) { throw 'C5 prerequisite matrix failed.' }

    for ($index = 0; $index -lt $bridgeMigrations.Count; $index++) {
        $stage = $index + 1
        docker cp $bridgeMigrations[$index] "${container}:/tmp/pre-c6-bridge-$stage.sql" | Out-Null
        # Supabase applies each migration atomically. The single-transaction flag
        # is also required by the prelaunch migration because its audit snapshot
        # is an ON COMMIT DROP temporary table consumed later in the same file.
        docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 `
            -U supabase_admin -d postgres -f "/tmp/pre-c6-bridge-$stage.sql" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Pre-C6 bridge migration failed: $($bridgeMigrationNames[$index])"
        }
    }

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

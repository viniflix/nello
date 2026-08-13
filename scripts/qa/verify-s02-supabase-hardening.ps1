param(
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container = 'nello_clinical_attachments_test'
$migrations = @(
    '20260813020000_s02_revoke_public_schema_create.sql',
    '20260813020100_s02_optimize_auth_rls_initplans.sql',
    '20260813020200_s02_consolidate_episode_select_policies.sql',
    '20260813020300_s02_remove_duplicate_anamnesis_index.sql'
) | ForEach-Object { Join-Path $root "supabase\migrations\$_" }
$stageMatrices = @(
    's02_stage1_schema_privileges_matrix.sql',
    's02_stage2_auth_rls_matrix.sql',
    's02_stage3_episode_policy_matrix.sql',
    's02_stage4_index_matrix.sql'
) | ForEach-Object { Join-Path $root "supabase\tests\$_" }
foreach ($file in @($migrations) + @($stageMatrices)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required S0.2 artifact is missing: $file" }
}

try {
    & (Join-Path $PSScriptRoot 'verify-pre-c6-hardening.ps1') -KeepContainer
    if ($LASTEXITCODE -ne 0) { throw 'Pre-C6 prerequisite matrix failed.' }

    for ($index = 0; $index -lt $migrations.Count; $index++) {
        $stage = $index + 1
        docker cp $migrations[$index] "${container}:/tmp/s02-stage-$stage.sql" | Out-Null
        docker cp $stageMatrices[$index] "${container}:/tmp/s02-stage-$stage-matrix.sql" | Out-Null

        docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f "/tmp/s02-stage-$stage.sql" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "S0.2 stage $stage migration failed." }

        docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f "/tmp/s02-stage-$stage-matrix.sql"
        if ($LASTEXITCODE -ne 0) { throw "S0.2 stage $stage isolated matrix failed." }

        Write-Output "PASS: S0.2 stage $stage approved independently."
    }

    # Reexecuta cada contrato no estado final. Isso detecta interferencia entre
    # estagios sem recorrer a fixtures antigas que antecedem a verificacao B4.
    for ($index = 0; $index -lt $stageMatrices.Count; $index++) {
        $stage = $index + 1
        docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f "/tmp/s02-stage-$stage-matrix.sql" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "S0.2 stage $stage failed in the integrated state." }
    }

    Write-Output 'S0.2 schema privileges, RLS optimization, episode isolation and index cleanup approved as a group.'
}
finally {
    if (-not $KeepContainer) { docker rm -f $container 2>$null | Out-Null }
}

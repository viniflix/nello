$ErrorActionPreference = 'Stop'

$container = 'nello_clinical_record_foundation_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$baseline = Join-Path $root 'supabase\baseline\remote_schema_20260711.sql'
$migrations = @(
    (Join-Path $root 'supabase\migrations\20260711100000_enforce_one_active_nutritionist_per_patient.sql'),
    (Join-Path $root 'supabase\migrations\20260711113000_create_care_episodes_foundation.sql'),
    (Join-Path $root 'supabase\migrations\20260711114500_gate_care_episode_rpcs_until_b2.sql'),
    (Join-Path $root 'supabase\migrations\20260711120000_add_care_episodes_foundation.sql'),
    (Join-Path $root 'supabase\migrations\20260711130000_add_clinical_episode_isolation.sql'),
    (Join-Path $root 'supabase\migrations\20260711131500_allow_patient_clinical_episode_assignment.sql'),
    (Join-Path $root 'supabase\migrations\20260711133000_add_patient_owned_episode_isolation.sql'),
    (Join-Path $root 'supabase\migrations\20260711140000_enable_care_journeys.sql'),
    (Join-Path $root 'supabase\migrations\20260712100000_create_professional_verification_foundation.sql'),
    (Join-Path $root 'supabase\migrations\20260712110000_add_professional_verification_workflow.sql'),
    (Join-Path $root 'supabase\migrations\20260712120000_enforce_verified_clinical_capacity.sql'),
    (Join-Path $root 'supabase\migrations\20260712130000_add_student_supervision_workflow.sql')
)
$c1Migration = Join-Path $root 'supabase\migrations\20260712140000_create_clinical_record_foundation.sql'
$matrix = Join-Path $root 'supabase\tests\clinical_record_foundation_matrix.sql'

foreach ($file in @($baseline, $matrix) + $migrations) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required local Supabase artifact is missing: $file" }
}

$matrixSql = Get-Content -Raw -LiteralPath $matrix
$requiredMatrixContracts = @(
    'two_ended_episodes_required',
    'missing_patient_name_was_accepted',
    'former_professional_record_isolation_failed',
    'former_professional_guardian_isolation_failed',
    'unrelated_professional_read_clinical_content',
    'admin_read_clinical_content',
    'patient_cannot_read_own_records',
    'unsupervised_student_created_real_draft',
    'supervised_draft_attribution_failed',
    'profile_event_mutation_was_allowed',
    'clinical_record_hard_delete_was_allowed',
    'clinical_record_system_type_mutation_was_allowed',
    'get_patient_record_foundation_or_clinical_records_absent'
)
foreach ($contract in $requiredMatrixContracts) {
    if (-not $matrixSql.Contains($contract)) { throw "Clinical record matrix contract is missing: $contract" }
}

$existing = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing -eq $container) { docker rm -f $container | Out-Null }

try {
    docker run -d --name $container -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=postgres $image | Out-Null
    $stableReadyChecks = 0
    foreach ($attempt in 1..60) {
        docker exec -e PGPASSWORD=postgres $container pg_isready -U supabase_admin -d postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $stableReadyChecks += 1
            if ($stableReadyChecks -ge 3) { break }
        } else { $stableReadyChecks = 0 }
        Start-Sleep -Seconds 2
    }
    if ($stableReadyChecks -lt 3) { throw 'Local database did not stabilize.' }

    docker cp $baseline "${container}:/tmp/baseline.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/clinical-record-foundation-matrix.sql" | Out-Null
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        docker cp $migrations[$index] "${container}:/tmp/b-migration-$index.sql" | Out-Null
    }
    if (Test-Path -LiteralPath $c1Migration) {
        docker cp $c1Migration "${container}:/tmp/c1.sql" | Out-Null
    }

    $commands = @(
        @{ Label = 'database preparation'; Sql = 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;' },
        @{ Label = 'baseline restore'; Sql = '\i /tmp/baseline.sql' },
        @{ Label = 'alpha seed'; Sql = @'
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000041','authenticated','authenticated','alpha-c1@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000041','authenticated','authenticated','patient-c1@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000041','authenticated','authenticated','admin-c1@nello.test','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000041','Nutricionista Atual C1','nutritionist',false,true),
('20000000-0000-0000-0000-000000000041','Paciente C1','patient',false,true),
('30000000-0000-0000-0000-000000000041','Admin C1','patient',true,true);
'@ }
    )
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        $commands += @{ Label = "B1-B4 migration $($index + 1)"; Sql = "\i /tmp/b-migration-$index.sql" }
    }
    if (Test-Path -LiteralPath $c1Migration) { $commands += @{ Label = 'C1 migration'; Sql = '\i /tmp/c1.sql' } }
    $commands += @{ Label = 'clinical record foundation matrix'; Sql = '\i /tmp/clinical-record-foundation-matrix.sql'; ShowOutput = $true }

    foreach ($command in $commands) {
        if ($command.ShowOutput) {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql
        } else {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { throw "Clinical record foundation failed during $($command.Label)." }
    }
    Write-Output 'Clinical record foundation approved in local disposable database.'
}
finally {
    docker rm -f $container 2>$null | Out-Null
}

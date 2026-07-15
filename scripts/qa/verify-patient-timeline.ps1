param([switch]$KeepContainer)

$ErrorActionPreference = 'Stop'

$container = 'nello_patient_timeline_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
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
    (Join-Path $root 'supabase\migrations\20260712130000_add_student_supervision_workflow.sql'),
    (Join-Path $root 'supabase\migrations\20260712140000_create_clinical_record_foundation.sql'),
    (Join-Path $root 'supabase\migrations\20260712150000_harden_clinical_record_foundation.sql'),
    (Join-Path $root 'supabase\migrations\20260714100000_create_clinical_evolution_system.sql')
)
$c3Migration = Join-Path $root 'supabase\migrations\20260714110000_create_patient_timeline.sql'
$c3ReadCompatibilityMigration = Join-Path $root 'supabase\migrations\20260715010000_fix_clinical_write_lock_read_compatibility.sql'
$matrix = Join-Path $root 'supabase\tests\patient_timeline_matrix.sql'

foreach ($file in @($baseline, $matrix, $c3Migration, $c3ReadCompatibilityMigration) + $migrations) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required local Supabase artifact is missing: $file" }
}

$dockerAvailable = $false
try {
    docker info 2>$null | Out-Null
    $dockerAvailable = ($LASTEXITCODE -eq 0)
} catch {
    $dockerAvailable = $false
}
if (-not $dockerAvailable) {
    throw 'Docker Desktop indisponivel; matriz C3 nao executada'
}

$existing = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing -eq $container) { docker rm -f $container | Out-Null }

$containerCreated = $false
try {
    docker run -d --name $container -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=postgres $image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable C3 database container could not be created.' }
    $containerCreated = $true
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
    docker cp $matrix "${container}:/tmp/c3-matrix.sql" | Out-Null
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        docker cp $migrations[$index] "${container}:/tmp/migration-$index.sql" | Out-Null
    }
    docker cp $c3Migration "${container}:/tmp/c3.sql" | Out-Null
    docker cp $c3ReadCompatibilityMigration "${container}:/tmp/c3-read-compatibility.sql" | Out-Null

    $commands = @(
        @{ Label = 'database preparation'; Sql = 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;' },
        @{ Label = 'baseline restore'; Sql = '\i /tmp/baseline.sql' },
        @{ Label = 'timeline personas seed'; Sql = @'
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000051','authenticated','authenticated','current-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000052','authenticated','authenticated','former-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000053','authenticated','authenticated','unrelated-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000054','authenticated','authenticated','student-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000055','authenticated','authenticated','simulation-owner-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000051','authenticated','authenticated','patient-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000052','authenticated','authenticated','student-patient-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000056','authenticated','authenticated','simulation-patient-c3@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000051','authenticated','authenticated','admin-c3@nello.test','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000051','Nutricionista Atual C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000052','Nutricionista Anterior C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000053','Nutricionista Alheio C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000054','Estudante C3','nutritionist',false,true),
('10000000-0000-0000-0000-000000000055','Proprietario de Simulacao C3','nutritionist',false,true),
('20000000-0000-0000-0000-000000000051','Paciente C3','patient',false,true),
('20000000-0000-0000-0000-000000000052','Paciente do Estudante C3','patient',false,true),
('20000000-0000-0000-0000-000000000056','Paciente Simulado C3','patient',false,true),
('30000000-0000-0000-0000-000000000051','Administrador C3','patient',true,true);
'@ }
    )
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        $commands += @{ Label = "migration $($index + 1)"; Sql = "\i /tmp/migration-$index.sql" }
    }
    $commands += @{ Label = 'episode and verification seed'; Sql = @'
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values
('10000000-0000-0000-0000-000000000051','nutritionist','approved','official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000052','nutritionist','approved','official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000053','nutritionist','approved','official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000054','student','approved','student_document_manual',null,null,now()+interval '1 year',now(),'matrix')
on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,decision_reason=excluded.decision_reason;

insert into public.student_supervisions(
  student_id,supervisor_id,status,requested_at,responded_at,started_at
) values (
  '10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000051',
  'active',now(),now(),now()
);

update public.user_profiles
set is_simulation=true,simulation_owner_id='10000000-0000-0000-0000-000000000055'
where id='20000000-0000-0000-0000-000000000056';

update public.professional_verifications
set status='rejected',valid_until=now()-interval '1 day',reviewed_at=now(),decision_reason='simulation fixture'
where user_id='10000000-0000-0000-0000-000000000055';

insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by
) values
('40000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000052','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000052'),
('40000000-0000-0000-0000-000000000052','20000000-0000-0000-0000-000000000051','10000000-0000-0000-0000-000000000051','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000051',null),
('40000000-0000-0000-0000-000000000053','20000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000054','active',now()-interval '1 week',null,'student_started',null,'10000000-0000-0000-0000-000000000054',null),
('40000000-0000-0000-0000-000000000054','20000000-0000-0000-0000-000000000052','10000000-0000-0000-0000-000000000054','ended',now()-interval '3 months',now()-interval '2 months','student_started','ended','10000000-0000-0000-0000-000000000054','10000000-0000-0000-0000-000000000054'),
('40000000-0000-0000-0000-000000000055','20000000-0000-0000-0000-000000000056','10000000-0000-0000-0000-000000000055','active',now()-interval '1 day',null,'simulation',null,'10000000-0000-0000-0000-000000000055',null);
'@ }
    $commands += @{ Label = 'C3 migration'; Sql = '\i /tmp/c3.sql' }
    $commands += @{ Label = 'C3 read compatibility migration'; Sql = '\i /tmp/c3-read-compatibility.sql' }
    $commands += @{ Label = 'C3 patient timeline matrix'; Sql = '\i /tmp/c3-matrix.sql'; ShowOutput = $true }

    foreach ($command in $commands) {
        if ($command.ShowOutput) {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql
        } else {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { throw "Patient timeline failed during $($command.Label)." }
    }
    Write-Output 'Patient timeline approved in local disposable database.'
}
finally {
    if ($containerCreated -and -not $KeepContainer) {
        docker rm -f $container 2>$null | Out-Null
    }
}

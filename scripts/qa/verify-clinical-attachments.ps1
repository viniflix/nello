param(
    [switch]$ExpectRed,
    [switch]$KeepContainer
)

$ErrorActionPreference = 'Stop'

$container = 'nello_clinical_attachments_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$baseline = Join-Path $root 'supabase\baseline\remote_schema_20260711.sql'
$migrationNames = @(
    '20260711100000_enforce_one_active_nutritionist_per_patient.sql',
    '20260711113000_create_care_episodes_foundation.sql',
    '20260711114500_gate_care_episode_rpcs_until_b2.sql',
    '20260711120000_add_care_episodes_foundation.sql',
    '20260711130000_add_clinical_episode_isolation.sql',
    '20260711131500_allow_patient_clinical_episode_assignment.sql',
    '20260711133000_add_patient_owned_episode_isolation.sql',
    '20260711140000_enable_care_journeys.sql',
    '20260712100000_create_professional_verification_foundation.sql',
    '20260712110000_add_professional_verification_workflow.sql',
    '20260712120000_enforce_verified_clinical_capacity.sql',
    '20260712130000_add_student_supervision_workflow.sql',
    '20260712140000_create_clinical_record_foundation.sql',
    '20260712150000_harden_clinical_record_foundation.sql',
    '20260714100000_create_clinical_evolution_system.sql',
    '20260714110000_create_patient_timeline.sql',
    '20260715010000_fix_clinical_write_lock_read_compatibility.sql',
    '20260715120000_create_clinical_record_amendments.sql',
    '20260715130000_secure_patient_clinical_record_projection.sql'
)
$migrations = $migrationNames | ForEach-Object { Join-Path $root "supabase\migrations\$_" }
$c5Migration = Join-Path $root 'supabase\migrations\20260802120000_create_clinical_attachment_domain.sql'
$matrix = Join-Path $root 'supabase\tests\clinical_attachments_contract_matrix.sql'

foreach ($file in @($baseline, $matrix) + $migrations) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required C5 artifact is missing: $file" }
}
if (-not $ExpectRed -and -not (Test-Path -LiteralPath $c5Migration)) {
    throw "Required C5 migration is missing: $c5Migration"
}

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop indisponivel; matriz C5 nao executada.' }

$existing = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing -eq $container) { docker rm -f $container | Out-Null }

$containerCreated = $false
try {
    docker run -d --name $container -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=postgres $image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable C5 database container could not be created.' }
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
    if ($stableReadyChecks -lt 3) { throw 'Local C5 database did not stabilize.' }

    docker cp $baseline "${container}:/tmp/baseline.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/c5-matrix.sql" | Out-Null
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        docker cp $migrations[$index] "${container}:/tmp/migration-$index.sql" | Out-Null
    }
    if (-not $ExpectRed) { docker cp $c5Migration "${container}:/tmp/c5.sql" | Out-Null }

    $commands = @(
        @{ Label='database preparation'; Sql='CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;' },
        @{ Label='baseline restore'; Sql='\i /tmp/baseline.sql' },
        @{ Label='C5 personas seed'; Sql=@'
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000081','authenticated','authenticated','nutritionist-c5@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000081','authenticated','authenticated','patient-c5@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000082','authenticated','authenticated','other-patient-c5@nello.test','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000081','Nutricionista C5','nutritionist',false,true),
('20000000-0000-0000-0000-000000000081','Paciente C5','patient',false,true),
('20000000-0000-0000-0000-000000000082','Outro Paciente C5','patient',false,true);
'@ }
    )
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        $commands += @{ Label="migration $($index + 1)"; Sql="\i /tmp/migration-$index.sql" }
    }
    $commands += @{ Label='C5 episode seed'; Sql=@'
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values (
  '10000000-0000-0000-0000-000000000081','nutritionist','approved',
  'official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'
) on conflict (user_id) do update set
  professional_role=excluded.professional_role,status=excluded.status,
  verification_method=excluded.verification_method,crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,normalized_crn=null,valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,decision_reason=excluded.decision_reason;
insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,start_reason,started_by
) values
(
  '40000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081','active',now(),'matrix',
  '10000000-0000-0000-0000-000000000081'
),(
  '40000000-0000-0000-0000-000000000082','20000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000081','active',now(),'matrix-other',
  '10000000-0000-0000-0000-000000000081'
);
insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,content
) values (
  '70000000-0000-0000-0000-000000000082','20000000-0000-0000-0000-000000000082',
  '40000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081','initial_assessment','draft','{}'::jsonb
);
'@ }
    if (-not $ExpectRed) { $commands += @{ Label='C5 stage 2 migration'; Sql='\i /tmp/c5.sql' } }

    foreach ($command in $commands) {
        docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "C5 setup failed during $($command.Label)." }
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $matrixOutput = docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -v stage2_only=1 -U supabase_admin -d postgres -f /tmp/c5-matrix.sql 2>&1
    $matrixExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($ExpectRed) {
        if ($matrixExitCode -eq 0 -or ($matrixOutput -join "`n") -notmatch 'clinical_attachments_missing') {
            throw "C5 RED contract did not fail for the expected missing domain.`n$($matrixOutput -join "`n")"
        }
        Write-Output 'PASS: C5 contract reproduced RED because the attachment domain is absent.'
    } else {
        if ($matrixExitCode -ne 0) { throw "C5 stage 2 matrix failed.`n$($matrixOutput -join "`n")" }
        $concurrencySeed = @'
create table public.c5_concurrency_barrier(release boolean not null default false);
insert into public.c5_concurrency_barrier(release) values(false);
insert into public.clinical_attachments(
  id,patient_id,care_episode_id,category_code,description,source,author_id,
  storage_path,original_filename,mime_type,size_bytes,sha256,status,visibility
) values (
  '50000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000081',
  '40000000-0000-0000-0000-000000000081','report','Base concorrente C5','nutritionist',
  '10000000-0000-0000-0000-000000000081','c5/concurrency/base','base.pdf',
  'application/pdf',100,repeat('d',64),'active','professional_private'
);
'@
        docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $concurrencySeed | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'C5 concurrency fixture could not be prepared.' }

        $barrierKey = 91052
        $blocker = Start-Job -ScriptBlock {
            param($ContainerName,$Key)
            $sql = "select pg_advisory_lock($Key); do `$`$ begin loop exit when (select release from public.c5_concurrency_barrier limit 1); perform pg_sleep(0.05); end loop; end `$`$; select pg_advisory_unlock($Key);"
            $sql | docker exec -i -e PGPASSWORD=postgres $ContainerName psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres 2>&1 | Out-Null
        } -ArgumentList $container,$barrierKey
        foreach ($attempt in 1..100) {
            $held = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select count(*) from pg_locks where locktype='advisory' and objid=$barrierKey and granted"
            if ([int]$held -ge 1) { break }
            Start-Sleep -Milliseconds 50
        }
        if ([int]$held -lt 1) { throw 'C5 concurrency barrier was not acquired.' }

        $jobs = 1..2 | ForEach-Object {
            $suffix = $_
            $attachmentId = if ($suffix -eq 1) { '50000000-0000-0000-0000-000000000092' } else { '50000000-0000-0000-0000-000000000093' }
            $sql = "begin; select pg_advisory_xact_lock_shared($barrierKey); insert into public.clinical_attachments(id,patient_id,care_episode_id,root_attachment_id,version,replaces_attachment_id,category_code,description,source,author_id,storage_path,original_filename,mime_type,size_bytes,sha256,status,visibility) values('$attachmentId','20000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000091',2,'50000000-0000-0000-0000-000000000091','report','Substituicao concorrente C5','nutritionist','10000000-0000-0000-0000-000000000081','c5/concurrency/version-$suffix','version-$suffix.pdf','application/pdf',100,repeat('e',64),'uploading','professional_private'); commit;"
            Start-Job -ScriptBlock {
                param($ContainerName,$Statement)
                $output = & docker exec -e PGPASSWORD=postgres $ContainerName psql -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U supabase_admin -d postgres -c $Statement 2>&1
                [pscustomobject]@{ ExitCode=$LASTEXITCODE; Output=($output -join "`n") }
            } -ArgumentList $container,$sql
        }
        try {
            foreach ($attempt in 1..100) {
                $waiting = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select count(*) from pg_locks where locktype='advisory' and objid=$barrierKey and not granted"
                if ([int]$waiting -ge 2) { break }
                Start-Sleep -Milliseconds 50
            }
            if ([int]$waiting -lt 2) { throw 'C5 replacement sessions did not overlap.' }
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c 'update public.c5_concurrency_barrier set release=true' | Out-Null
            $blocker | Wait-Job | Receive-Job | Out-Null
            $results = $jobs | Wait-Job | Receive-Job
        } finally {
            docker exec -e PGPASSWORD=postgres $container psql -U supabase_admin -d postgres -c 'update public.c5_concurrency_barrier set release=true' 2>$null | Out-Null
            $blocker | Stop-Job -ErrorAction SilentlyContinue
            $blocker | Remove-Job -Force -ErrorAction SilentlyContinue
            $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
        }
        $winners = @($results | Where-Object { $_.ExitCode -eq 0 }).Count
        $conflicts = @($results | Where-Object {
            $_.ExitCode -ne 0 -and $_.Output -match '23505' -and $_.Output -match 'clinical_attachments_root_version_idx'
        }).Count
        if ($winners -ne 1 -or $conflicts -ne 1) {
            throw "C5 concurrent replacement expected one atomic winner and one root/version conflict.`n$($results.Output -join "`n")"
        }
        Write-Output 'PASS: C5 replacement chain has exactly one atomic version winner.'
        Write-Output 'Clinical attachment domain stage 2 approved in local disposable database.'
    }
}
finally {
    if ($containerCreated -and -not $KeepContainer) { docker rm -f $container 2>$null | Out-Null }
}

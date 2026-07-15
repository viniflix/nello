param([switch]$KeepContainer)

$ErrorActionPreference = 'Stop'

$container = 'nello_clinical_record_amendments_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$baseline = Join-Path $root 'supabase\baseline\remote_schema_20260711.sql'
$migrations = @(
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
    '20260715120000_create_clinical_record_amendments.sql'
) | ForEach-Object { Join-Path $root "supabase\migrations\$_" }
$matrix = Join-Path $root 'supabase\tests\clinical_record_amendments_matrix.sql'
$concurrencySetup = Join-Path $root 'supabase\tests\clinical_record_amendments_concurrency_setup.sql'

foreach ($file in @($baseline, $matrix, $concurrencySetup) + $migrations) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required local Supabase artifact is missing: $file"
    }
}

$dockerAvailable = $false
try {
    docker info 2>$null | Out-Null
    $dockerAvailable = ($LASTEXITCODE -eq 0)
} catch {
    $dockerAvailable = $false
}
if (-not $dockerAvailable) {
    throw 'Docker Desktop indisponivel; matriz C4 nao executada'
}

$existing = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing -eq $container) { docker rm -f $container | Out-Null }

$containerCreated = $false
try {
    docker run -d --name $container -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=postgres $image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Disposable C4 database container could not be created.' }
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
    if ($stableReadyChecks -lt 3) { throw 'Local C4 database did not stabilize.' }

    docker cp $baseline "${container}:/tmp/baseline.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/c4-matrix.sql" | Out-Null
    docker cp $concurrencySetup "${container}:/tmp/c4-concurrency-setup.sql" | Out-Null
    for ($index = 0; $index -lt $migrations.Count; $index++) {
        docker cp $migrations[$index] "${container}:/tmp/migration-$index.sql" | Out-Null
    }

    $commands = @(
        @{
            Label = 'database preparation'
            Sql = 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;'
        },
        @{ Label = 'baseline restore'; Sql = '\i /tmp/baseline.sql' },
        @{ Label = 'C4 personas seed'; Sql = @'
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000061','authenticated','authenticated','current-c4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000062','authenticated','authenticated','former-c4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000063','authenticated','authenticated','unrelated-c4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000064','authenticated','authenticated','student-c4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000061','authenticated','authenticated','patient-c4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000061','authenticated','authenticated','admin-c4@nello.test','not-used',now(),'{}','{}',now(),now());

insert into public.user_profiles(id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000061','Nutricionista Atual C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000062','Nutricionista Anterior C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000063','Nutricionista Alheio C4','nutritionist',false,true),
('10000000-0000-0000-0000-000000000064','Estudante C4','nutritionist',false,true),
('20000000-0000-0000-0000-000000000061','Paciente C4','patient',false,true),
('30000000-0000-0000-0000-000000000061','Administrador C4','patient',true,true);
'@ }
    )

    for ($index = 0; $index -lt $migrations.Count; $index++) {
        $commands += @{ Label = "migration $($index + 1)"; Sql = "\i /tmp/migration-$index.sql" }
    }

    $commands += @{ Label = 'C4 capability and episode seed'; Sql = @'
insert into public.professional_verifications(
  user_id,professional_role,status,verification_method,crn_number,crn_region,
  valid_until,reviewed_at,decision_reason
) values
('10000000-0000-0000-0000-000000000061','nutritionist','approved','official_registry_manual','12345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000062','nutritionist','approved','official_registry_manual','22345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000063','nutritionist','approved','official_registry_manual','32345','CRN-3',now()+interval '1 year',now(),'matrix'),
('10000000-0000-0000-0000-000000000064','student','approved','student_document_manual',null,null,now()+interval '1 year',now(),'matrix')
on conflict (user_id) do update set
  professional_role=excluded.professional_role,
  status=excluded.status,
  verification_method=excluded.verification_method,
  crn_number=excluded.crn_number,
  crn_region=excluded.crn_region,
  normalized_crn=null,
  valid_until=excluded.valid_until,
  reviewed_at=excluded.reviewed_at,
  decision_reason=excluded.decision_reason;

insert into public.student_supervisions(
  student_id,supervisor_id,status,requested_at,responded_at,started_at
) values (
  '10000000-0000-0000-0000-000000000064','10000000-0000-0000-0000-000000000061',
  'active',now(),now(),now()
);

insert into public.care_episodes(
  id,patient_id,nutritionist_id,status,started_at,ended_at,start_reason,end_reason,started_by,ended_by
) values
('40000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000061','active',now()-interval '1 month',null,'started',null,'10000000-0000-0000-0000-000000000061',null),
('40000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000062','ended',now()-interval '1 year',now()-interval '6 months','started','ended','10000000-0000-0000-0000-000000000062','10000000-0000-0000-0000-000000000062');
'@ }
    $commands += @{ Label = 'C4 amendment matrix'; Sql = '\i /tmp/c4-matrix.sql'; ShowOutput = $true }

    foreach ($command in $commands) {
        if ($command.ShowOutput) {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql
        } else {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Clinical record amendments failed during $($command.Label)."
        }
    }

    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c4-concurrency-setup.sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'C4 concurrency fixtures could not be prepared.' }

    function Invoke-C4ConcurrencyPair {
        param([string]$Label, [string]$FirstSql, [string]$SecondSql)
        $script:c4BarrierKey += 1
        $barrierKey = $script:c4BarrierKey
        $blocker = Start-Job -ScriptBlock {
            param($ContainerName, $Key)
            $sql = "select pg_advisory_lock($Key);`ninsert into public.c4_concurrency_barrier_control(barrier_key,release) values ($Key,false) on conflict (barrier_key) do update set release=false;`ndo `$`$ begin loop exit when (select release from public.c4_concurrency_barrier_control where barrier_key=$Key); perform pg_sleep(0.05); end loop; end `$`$;`nselect pg_advisory_unlock($Key);"
            $sql | docker exec -i -e PGPASSWORD=postgres $ContainerName psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Barrier session $Key failed." }
        } -ArgumentList $container, $barrierKey
        foreach ($attempt in 1..100) {
            $ready = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select count(*) from public.c4_concurrency_barrier_control where barrier_key=$barrierKey and not release"
            if ($ready -eq '1') { break }
            Start-Sleep -Milliseconds 50
        }
        if ($ready -ne '1') { throw "C4 concurrency barrier '$Label' did not acquire its lock." }

        $jobs = @($FirstSql, $SecondSql) | ForEach-Object {
            $coordinatedSql = $_.Replace('__BARRIER__', "perform pg_advisory_xact_lock_shared($barrierKey);")
            Start-Job -ScriptBlock {
                param($ContainerName, $Sql)
                $output = & docker exec -e PGPASSWORD=postgres $ContainerName psql -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose -U supabase_admin -d postgres -c $Sql 2>&1
                [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } -ArgumentList $container, $coordinatedSql
        }
        try {
            foreach ($attempt in 1..100) {
                $waiting = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select count(*) from pg_locks where locktype='advisory' and objid=$barrierKey and not granted"
                if ([int]$waiting -ge 2) { break }
                Start-Sleep -Milliseconds 50
            }
            if ([int]$waiting -lt 2) { throw "C4 concurrency scenario '$Label' did not overlap both sessions." }
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "update public.c4_concurrency_barrier_control set release=true where barrier_key=$barrierKey" | Out-Null
            $blocker | Wait-Job | Receive-Job | Out-Null
            $results = $jobs | Wait-Job | Receive-Job
        } finally {
            docker exec -e PGPASSWORD=postgres $container psql -U supabase_admin -d postgres -c "update public.c4_concurrency_barrier_control set release=true where barrier_key=$barrierKey" 2>$null | Out-Null
            $blocker | Stop-Job -ErrorAction SilentlyContinue
            $blocker | Remove-Job -Force -ErrorAction SilentlyContinue
            $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
        }
        $winners = @($results | Where-Object { $_.ExitCode -eq 0 }).Count
        $losers = @($results | Where-Object { $_.ExitCode -ne 0 })
        $conflicts = @($losers | Where-Object {
            $_.Output -match '40001' -and $_.Output -match 'amendment_chain_conflict'
        }).Count
        if ($winners -ne 1 -or $losers.Count -ne 1 -or $conflicts -ne 1) {
            $evidence = ($results | ForEach-Object { "exit=$($_.ExitCode) $($_.Output)" }) -join "`n"
            throw "C4 concurrency scenario '$Label' expected one winner and one amendment_chain_conflict.`n$evidence"
        }
        Write-Output "PASS: $Label has exactly one atomic winner."
    }

    $script:c4BarrierKey = 91040
    $actor = '10000000-0000-0000-0000-000000000061'
    $correction71 = "begin; set role authenticated; select set_config('request.jwt.claim.sub','$actor',true); do `$`$ declare v_impact jsonb; begin v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000071'); __BARRIER__ perform public.start_clinical_record_correction('70000000-0000-0000-0000-000000000071','Correcao concorrente valida com justificativa clinica suficiente.',jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)); end `$`$; commit;"
    Invoke-C4ConcurrencyPair 'double correction' $correction71 $correction71

    $replacement75 = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select replacement_record_id from public.clinical_record_amendments where target_record_id='70000000-0000-0000-0000-000000000075' and status='draft'"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($replacement75)) { throw 'Correction-versus-invalidation replacement was not found.' }
    $sign75 = "begin; set role authenticated; select set_config('request.jwt.claim.sub','$actor',true); select set_config('request.jwt.claims',jsonb_build_object('sub','$actor','aal','aal1')::text,true); do `$`$ begin __BARRIER__ perform public.sign_clinical_record('$($replacement75.Trim())'); end `$`$; commit;"
    $invalidate75 = "begin; set role authenticated; select set_config('request.jwt.claim.sub','$actor',true); select set_config('request.jwt.claims',jsonb_build_object('sub','$actor','auth_time',extract(epoch from now())::bigint,'aal','aal1','session_id','race-75','amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true); do `$`$ declare v_impact jsonb; begin v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000075'); __BARRIER__ perform public.invalidate_clinical_record('70000000-0000-0000-0000-000000000075','Invalidacao concorrente contra assinatura corretiva com motivo suficiente.',jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)); end `$`$; commit;"
    Invoke-C4ConcurrencyPair 'correction signing versus invalidation' $sign75 $invalidate75

    $invalidate73 = "begin; set role authenticated; select set_config('request.jwt.claim.sub','$actor',true); select set_config('request.jwt.claims',jsonb_build_object('sub','$actor','auth_time',extract(epoch from now())::bigint,'aal','aal1','session_id','race-73','amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true); do `$`$ declare v_impact jsonb; begin v_impact:=public.get_clinical_record_amendment_impact('70000000-0000-0000-0000-000000000073'); __BARRIER__ perform public.invalidate_clinical_record('70000000-0000-0000-0000-000000000073','Invalidacao concorrente duplicada com justificativa clinica suficiente.',jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)); end `$`$; commit;"
    Invoke-C4ConcurrencyPair 'double invalidation' $invalidate73 $invalidate73

    $replacement = docker exec -e PGPASSWORD=postgres $container psql -At -U supabase_admin -d postgres -c "select replacement_record_id from public.clinical_record_amendments where target_record_id='70000000-0000-0000-0000-000000000074' and status='draft'"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($replacement)) { throw 'Signing concurrency replacement was not found.' }
    $sign74 = "begin; set role authenticated; select set_config('request.jwt.claim.sub','$actor',true); select set_config('request.jwt.claims',jsonb_build_object('sub','$actor','aal','aal1')::text,true); do `$`$ begin __BARRIER__ perform public.sign_clinical_record('$($replacement.Trim())'); end `$`$; commit;"
    Invoke-C4ConcurrencyPair 'double signing' $sign74 $sign74

    $concurrencyInvariant = "do `$`$ begin if (select count(*) from public.clinical_record_amendments where root_record_id='70000000-0000-0000-0000-000000000071' and status='draft')<>1 or (select count(*) from public.clinical_record_amendments where root_record_id='70000000-0000-0000-0000-000000000073' and status='effective')<>1 or (select count(*) from public.clinical_record_amendments where root_record_id='70000000-0000-0000-0000-000000000074' and status='effective')<>1 or (select count(*) from public.clinical_record_amendments where root_record_id='70000000-0000-0000-0000-000000000075' and status='effective')<>1 then raise exception 'c4_concurrency_postcondition_failed'; end if; end `$`$;"
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $concurrencyInvariant | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'C4 concurrency postconditions failed.' }

    Write-Output 'Clinical record amendments approved in local disposable database.'
}
finally {
    if ($containerCreated -and -not $KeepContainer) {
        docker rm -f $container 2>$null | Out-Null
    }
}

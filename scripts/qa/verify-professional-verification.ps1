$ErrorActionPreference = 'Stop'

$container = 'nello_professional_verification_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$baseline = Join-Path $root 'supabase\baseline\remote_schema_20260711.sql'
$migration = Join-Path $root 'supabase\migrations\20260712100000_create_professional_verification_foundation.sql'
$workflowMigration = Join-Path $root 'supabase\migrations\20260712110000_add_professional_verification_workflow.sql'
$matrix = Join-Path $root 'supabase\tests\professional_verification_foundation_matrix.sql'

foreach ($file in @($baseline, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required local Supabase artifact is missing: $file" }
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
    docker cp $matrix "${container}:/tmp/professional-verification-matrix.sql" | Out-Null
    if (Test-Path -LiteralPath $migration) {
        docker cp $migration "${container}:/tmp/professional-verification.sql" | Out-Null
    }
    if (Test-Path -LiteralPath $workflowMigration) {
        docker cp $workflowMigration "${container}:/tmp/professional-verification-workflow.sql" | Out-Null
    }

    $commands = @(
        @{ Label = 'database preparation'; Sql = 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;'; ShowOutput = $false },
        @{ Label = 'baseline restore'; Sql = '\i /tmp/baseline.sql'; ShowOutput = $false },
        @{ Label = 'alpha seed'; Sql = @'
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000041','authenticated','authenticated','alpha-b4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000041','authenticated','authenticated','patient-b4@nello.test','not-used',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-000000000041','authenticated','authenticated','admin-b4@nello.test','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles (id,name,user_type,is_admin,is_active) values
('10000000-0000-0000-0000-000000000041','Nutricionista Alpha B4','nutritionist',false,true),
('20000000-0000-0000-0000-000000000041','Paciente B4','patient',false,true),
('30000000-0000-0000-0000-000000000041','Admin B4','patient',true,true);
'@; ShowOutput = $false }
    )

    if (Test-Path -LiteralPath $migration) {
        $commands += @{ Label = 'professional verification migration'; Sql = '\i /tmp/professional-verification.sql'; ShowOutput = $false }
    }
    if (Test-Path -LiteralPath $workflowMigration) {
        $commands += @{ Label = 'professional verification workflow'; Sql = '\i /tmp/professional-verification-workflow.sql'; ShowOutput = $false }
    }

    $commands += @(
        @{ Label = 'new professional seed'; Sql = @'
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000042','authenticated','authenticated','new-b4@nello.test','not-used',now(),'{}','{}',now(),now());
insert into public.user_profiles (id,name,user_type,is_admin,is_active)
values ('10000000-0000-0000-0000-000000000042','Nutricionista Nova B4','nutritionist',false,true);
'@; ShowOutput = $false },
        @{ Label = 'professional verification matrix'; Sql = '\i /tmp/professional-verification-matrix.sql'; ShowOutput = $true }
    )

    foreach ($command in $commands) {
        if ($command.ShowOutput) {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql
        } else {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { throw "Professional verification failed during $($command.Label)." }
    }

    Write-Output 'Professional verification foundation approved in local disposable database.'
}
finally {
    docker rm -f $container 2>$null | Out-Null
}

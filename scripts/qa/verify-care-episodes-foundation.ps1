$ErrorActionPreference = 'Stop'

$container = 'nello_care_episodes_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$baseline = Join-Path $root 'supabase\baseline\remote_schema_20260711.sql'
$activeLinkMigration = Join-Path $root 'supabase\migrations\20260711100000_enforce_one_active_nutritionist_per_patient.sql'
$episodeMigration = Join-Path $root 'supabase\migrations\20260711113000_create_care_episodes_foundation.sql'
$matrix = Join-Path $root 'supabase\tests\care_episodes_matrix.sql'

foreach ($file in @($baseline, $activeLinkMigration, $episodeMigration, $matrix)) {
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
    docker cp $activeLinkMigration "${container}:/tmp/active-link.sql" | Out-Null
    docker cp $episodeMigration "${container}:/tmp/care-episodes.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/care-episodes-matrix.sql" | Out-Null

    $commands = @(
        @{ Label = 'database preparation'; Sql = 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;'; ShowOutput = $false },
        @{ Label = 'baseline restore'; Sql = '\i /tmp/baseline.sql'; ShowOutput = $false },
        @{ Label = 'active-link migration'; Sql = '\i /tmp/active-link.sql'; ShowOutput = $false },
        @{ Label = 'care-episodes migration'; Sql = '\i /tmp/care-episodes.sql'; ShowOutput = $false },
        @{ Label = 'care-episodes matrix'; Sql = '\i /tmp/care-episodes-matrix.sql'; ShowOutput = $true }
    )
    foreach ($command in $commands) {
        if ($command.ShowOutput) {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql
        } else {
            docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c $command.Sql | Out-Null
        }
        if ($LASTEXITCODE -ne 0) { throw "Local care-episodes verification failed during $($command.Label)." }
    }

    Write-Output 'Care episodes foundation approved in local disposable database.'
}
finally {
    docker rm -f $container 2>$null | Out-Null
}

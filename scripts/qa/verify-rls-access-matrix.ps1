$ErrorActionPreference = 'Stop'

$container = 'nello_rls_matrix_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$baseline = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\supabase\baseline\remote_schema_20260711.sql'))
$migration = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\supabase\migrations\20260711100000_enforce_one_active_nutritionist_per_patient.sql'))
$matrix = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\supabase\tests\rls_access_matrix.sql'))

foreach ($file in @($baseline, $migration, $matrix)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Arquivo obrigatório ausente: $file" }
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
    if ($stableReadyChecks -lt 3) { throw 'Banco local não estabilizou.' }

    docker cp $baseline "${container}:/tmp/baseline.sql" | Out-Null
    docker cp $migration "${container}:/tmp/migration.sql" | Out-Null
    docker cp $matrix "${container}:/tmp/matrix.sql" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/baseline.sql | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/migration.sql | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/matrix.sql
    Write-Output 'Matriz RLS aprovada no banco local descartável.'
}
finally {
    docker rm -f $container 2>$null | Out-Null
}

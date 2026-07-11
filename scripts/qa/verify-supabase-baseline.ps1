$ErrorActionPreference = 'Stop'

$container = 'nello_baseline_test'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.063'
$baseline = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\supabase\baseline\remote_schema_20260711.sql'))

if (-not (Test-Path -LiteralPath $baseline)) {
    throw 'Capture a baseline antes de executar o restore.'
}

$existing = docker ps -a --filter "name=^/$container$" --format '{{.Names}}'
if ($existing -eq $container) { docker rm -f $container | Out-Null }

try {
    docker run -d --name $container -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=postgres $image | Out-Null

    $ready = $false
    $strictErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    foreach ($attempt in 1..45) {
        $count = docker exec -e PGPASSWORD=postgres $container psql -U supabase_admin -d postgres -Atc "select count(*) from pg_event_trigger where evtname='graphql_watch_ddl'" 2>$null
        if ($count -eq '1') { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    $ErrorActionPreference = $strictErrorPreference
    if (-not $ready) { throw 'A inicialização interna do Postgres local não concluiu.' }

    docker cp $baseline "${container}:/tmp/baseline.sql" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions; ALTER EVENT TRIGGER graphql_watch_ddl DISABLE; ALTER EVENT TRIGGER graphql_watch_drop DISABLE; ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;" | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/baseline.sql | Out-Null
    docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "ALTER EVENT TRIGGER graphql_watch_ddl ENABLE ALWAYS; ALTER EVENT TRIGGER graphql_watch_drop ENABLE ALWAYS; ALTER EVENT TRIGGER pgrst_ddl_watch ENABLE ALWAYS; ALTER EVENT TRIGGER pgrst_drop_watch ENABLE ALWAYS;" | Out-Null

    $counts = docker exec -e PGPASSWORD=postgres $container psql -U supabase_admin -d postgres -Atc "select (select count(*) from pg_tables where schemaname='public') || ',' || (select count(*) from pg_policies where schemaname='public') || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private');"
    if ($counts -ne '67,156,102,52') {
        throw "Baseline restaurou com contagens inesperadas: $counts"
    }

    Write-Output 'Baseline Supabase restaurada: 67 tabelas, 156 policies, 102 funções públicas e 52 privadas.'
}
finally {
    docker rm -f $container 2>$null | Out-Null
}

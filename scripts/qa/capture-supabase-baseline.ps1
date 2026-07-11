$ErrorActionPreference = 'Stop'

$projectRef = 'afyoidxrshkmplxhcyeh'
$output = Join-Path $PSScriptRoot '..\..\supabase\baseline\remote_schema_20260711.sql'
$output = [System.IO.Path]::GetFullPath($output)

if (-not $env:SUPABASE_DB_PASSWORD) {
    throw 'Defina SUPABASE_DB_PASSWORD somente nesta sessão antes de capturar a baseline.'
}

$dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
if (-not $dockerVersion) {
    throw 'Docker Desktop precisa estar ativo para o dump/restore oficial do Supabase.'
}

npx supabase link --project-ref $projectRef --password $env:SUPABASE_DB_PASSWORD
if ($LASTEXITCODE -ne 0) { throw 'Falha ao vincular o projeto Supabase.' }

npx supabase db dump --linked --password $env:SUPABASE_DB_PASSWORD --schema public,auth,storage --file $output
if ($LASTEXITCODE -ne 0) { throw 'Falha ao capturar o schema remoto.' }

$content = Get-Content -Raw -LiteralPath $output
$forbidden = @(
    '(?im)^\s*(INSERT|COPY)\s+',
    '(?i)service_role',
    '(?i)SUPABASE_DB_PASSWORD',
    '(?i)postgres(?:ql)?://[^\s]+'
)

foreach ($pattern in $forbidden) {
    if ($content -match $pattern) {
        Remove-Item -LiteralPath $output -Force
        throw "Baseline rejeitada pelo padrão de segurança: $pattern"
    }
}

Write-Output "Baseline de schema capturada em $output"

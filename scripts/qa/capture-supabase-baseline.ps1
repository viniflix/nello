$ErrorActionPreference = 'Stop'

$projectRef = 'afyoidxrshkmplxhcyeh'
$output = Join-Path $PSScriptRoot '..\..\supabase\baseline\remote_schema_20260711.sql'
$output = [System.IO.Path]::GetFullPath($output)

$dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
if (-not $dockerVersion) {
    throw 'Docker Desktop precisa estar ativo para o dump/restore oficial do Supabase.'
}

npx supabase link --project-ref $projectRef --yes
if ($LASTEXITCODE -ne 0) { throw 'Falha ao vincular o projeto Supabase.' }

npx supabase db dump --linked --schema public,private --file $output
if ($LASTEXITCODE -ne 0) { throw 'Falha ao capturar o schema remoto.' }

$content = Get-Content -Raw -LiteralPath $output
$forbidden = @(
    '(?im)^COPY\s+.+\s+FROM\s+stdin;',
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

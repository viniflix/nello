$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'verify-supabase-baseline.ps1'
$content = Get-Content -Raw -LiteralPath $scriptPath

if ($content -notmatch 'pg_isready') {
    throw 'A verificação precisa aguardar pg_isready, não um objeto interno transitório.'
}

if ($content -notmatch 'stableReadyChecks') {
    throw 'A verificação precisa exigir prontidão estável antes do restore.'
}

Write-Output 'Baseline readiness script contract passed.'

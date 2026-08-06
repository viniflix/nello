param(
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$source = Join-Path $root 'supabase'
$backupRoot = Join-Path $root '.codex-local\backups\supabase'
$manifestPath = Join-Path $backupRoot 'latest-manifest.json'

if (-not (Test-Path -LiteralPath $source)) { throw 'Local Supabase infrastructure is missing.' }
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$files = Get-ChildItem -LiteralPath $source -Recurse -File |
    Where-Object { $_.FullName -notmatch '[\\/]\.temp[\\/]' } |
    Sort-Object FullName
$manifest = @($files | ForEach-Object {
    [pscustomobject]@{
        path = $_.FullName.Substring($source.Length + 1).Replace('\', '/')
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
})

if ($VerifyOnly) {
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'No local Supabase integrity manifest exists.' }
    $expected = @(Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
    if (($expected | ConvertTo-Json -Depth 4 -Compress) -ne ($manifest | ConvertTo-Json -Depth 4 -Compress)) {
        throw 'Local Supabase files differ from the latest integrity manifest.'
    }
    Write-Output "Local Supabase integrity verified: $($manifest.Count) files."
    exit 0
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $backupRoot "supabase-$stamp.zip"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Compress-Archive -LiteralPath $source -DestinationPath $archive -CompressionLevel Optimal

Get-ChildItem -LiteralPath $backupRoot -Filter 'supabase-*.zip' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 5 |
    Remove-Item -Force

Write-Output "Local Supabase backup created: $archive"
Write-Output "Integrity manifest contains $($manifest.Count) files."

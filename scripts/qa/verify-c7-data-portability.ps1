param([switch]$KeepContainer)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container='nello_clinical_attachments_test'
$migration=Join-Path $root 'supabase\migrations\20260813030000_c7_data_portability_snapshot.sql'
$matrix=Join-Path $root 'supabase\tests\c7_data_portability_matrix.sql'
try {
  & (Join-Path $PSScriptRoot 'verify-c6-document-artifacts.ps1') -KeepContainer
  if($LASTEXITCODE -ne 0){throw 'C6 regression failed'}
  docker cp $migration "${container}:/tmp/c7.sql" | Out-Null
  docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c7.sql | Out-Null
  if($LASTEXITCODE -ne 0){throw 'C7 migration failed'}
  docker cp $matrix "${container}:/tmp/c7-matrix.sql" | Out-Null
  docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c7-matrix.sql
  if($LASTEXITCODE -ne 0){throw 'C7 matrix failed'}
  Write-Output 'C7 data portability matrix approved.'
} finally {
  if(-not $KeepContainer){docker rm -f $container 2>$null | Out-Null}
}

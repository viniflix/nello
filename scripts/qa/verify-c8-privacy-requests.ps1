param([switch]$KeepContainer)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container='nello_clinical_attachments_test'
$migration=Join-Path $root 'supabase\migrations\20260813031000_c8_data_subject_requests.sql'
$matrix=Join-Path $root 'supabase\tests\c8_data_subject_requests_matrix.sql'
try {
  & (Join-Path $PSScriptRoot 'verify-c7-data-portability.ps1') -KeepContainer
  if($LASTEXITCODE -ne 0){throw 'C7 regression failed'}
  docker cp $migration "${container}:/tmp/c8.sql" | Out-Null
  docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c8.sql | Out-Null
  if($LASTEXITCODE -ne 0){throw 'C8 migration failed'}
  docker cp $matrix "${container}:/tmp/c8-matrix.sql" | Out-Null
  docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c8-matrix.sql
  if($LASTEXITCODE -ne 0){throw 'C8 matrix failed'}
  Write-Output 'C8 LGPD request, retention decision and immutable audit matrix approved.'
} finally {
  if(-not $KeepContainer){docker rm -f $container 2>$null | Out-Null}
}

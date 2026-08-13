param([switch]$KeepContainer)
$ErrorActionPreference='Stop'
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'))
$container='nello_clinical_attachments_test'
$migration=Join-Path $root 'supabase\migrations\20260813022000_c6_private_document_assets.sql'
$matrix=Join-Path $root 'supabase\tests\c6_document_assets_matrix.sql'
foreach($file in @($migration,$matrix)){if(-not(Test-Path -LiteralPath $file)){throw "Required C6.2 artifact is missing: $file"}}
try{
  & (Join-Path $PSScriptRoot 'verify-c6-document-identity.ps1') -KeepContainer
  if($LASTEXITCODE -ne 0){throw 'C6.1 prerequisite matrix failed.'}
  docker cp $migration "${container}:/tmp/c6-document-assets.sql"|Out-Null
  docker cp $matrix "${container}:/tmp/c6-document-assets-matrix.sql"|Out-Null
  docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c6-document-assets.sql|Out-Null
  if($LASTEXITCODE -ne 0){throw 'C6.2 document assets migration failed.'}
  docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c6-document-assets-matrix.sql
  if($LASTEXITCODE -ne 0){throw 'C6.2 document assets matrix failed.'}
  Write-Output 'C6.2 private document assets and version-safe upload matrix approved.'
}finally{if(-not $KeepContainer){docker rm -f $container 2>$null|Out-Null}}

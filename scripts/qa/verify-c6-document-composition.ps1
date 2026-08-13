param([switch]$KeepContainer)
$ErrorActionPreference='Stop';$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '\..\..'));$container='nello_clinical_attachments_test'
$migration=Join-Path $root 'supabase\migrations\20260813023000_c6_document_composition_catalog.sql';$matrix=Join-Path $root 'supabase\tests\c6_document_composition_matrix.sql'
try{& (Join-Path $PSScriptRoot 'verify-c6-document-assets.ps1') -KeepContainer;if($LASTEXITCODE-ne 0){throw 'C6.2 prerequisite failed.'}
docker cp $migration "${container}:/tmp/c6-composition.sql"|Out-Null;docker cp $matrix "${container}:/tmp/c6-composition-matrix.sql"|Out-Null
docker exec -e PGPASSWORD=postgres $container psql --single-transaction -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c6-composition.sql|Out-Null;if($LASTEXITCODE-ne 0){throw 'C6.3 migration failed.'}
docker exec -e PGPASSWORD=postgres $container psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /tmp/c6-composition-matrix.sql;if($LASTEXITCODE-ne 0){throw 'C6.3 matrix failed.'}
Write-Output 'C6.3 controlled composition catalog approved.'}finally{if(-not $KeepContainer){docker rm -f $container 2>$null|Out-Null}}

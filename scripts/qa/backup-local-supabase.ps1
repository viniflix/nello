param(
    [switch]$VerifyOnly,
    [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
$nelloBackupScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../operations/infrastructure-backup.mjs'))
$nelloBackupArguments = @($nelloBackupScript)
if ($VerifyOnly) { $nelloBackupArguments += '--verify-only' }
if ($BackupRoot) { $nelloBackupArguments += @('--backup-root', $BackupRoot) }
& node @nelloBackupArguments
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure backup creation or verification failed.' }

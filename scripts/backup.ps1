#Requires -Version 7.2
[CmdletBinding()]
param(
  [string]$BackupRoot = $(if ($env:MARKETPILOT_BACKUP_ROOT) { $env:MARKETPILOT_BACKUP_ROOT } else { Join-Path $PSScriptRoot '../.backups/marketpilot' }),
  [string]$EnvFile = $(if ($env:MARKETPILOT_ENV_FILE) { $env:MARKETPILOT_ENV_FILE } else { Join-Path $PSScriptRoot '../.env.production' }),
  [string]$ProjectName = $(if ($env:MARKETPILOT_PROJECT_NAME) { $env:MARKETPILOT_PROJECT_NAME } else { 'marketpilot' }),
  [ValidateRange(7, 365)][int]$RetentionDays = 14
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($ProjectName -cnotmatch '^marketpilot(-[a-z0-9][a-z0-9-]*)?$') { throw 'Invalid MarketPilot project name' }
$resolvedRoot = [IO.Path]::GetFullPath($BackupRoot)
if ($resolvedRoot -eq [IO.Path]::GetPathRoot($resolvedRoot) -or $resolvedRoot -eq $repoRoot) { throw 'Unsafe backup directory' }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw 'Production env file not found' }
$null = Get-Command docker -ErrorAction Stop
$null = New-Item -ItemType Directory -Force -Path $resolvedRoot
$rootItem = Get-Item -LiteralPath $resolvedRoot
if ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Backup directory cannot be a symlink or junction' }
$target = Join-Path $resolvedRoot ('marketpilot-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '.dump')
$temporary = $target + '.partial'
if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $temporary)) { throw 'Backup path already exists' }
$composeArgs = @('compose', '--project-name', $ProjectName, '--env-file', [IO.Path]::GetFullPath($EnvFile), '-f', (Join-Path $repoRoot 'compose.production.yaml'))
try {
  # BaseStream preserves binary pg_dump output on every supported PowerShell version.
  $processInfo = [Diagnostics.ProcessStartInfo]::new('docker')
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  foreach ($argument in ($composeArgs + @('exec', '-T', 'marketpilot-postgres', 'sh', '-ec', 'PGPASSWORD="$MARKETPILOT_DB_PASSWORD" exec pg_dump --host=127.0.0.1 --username=marketpilot_app --dbname=marketpilot --format=custom --no-owner --no-acl'))) { $processInfo.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::Start($processInfo)
  $errorTask = $process.StandardError.ReadToEndAsync()
  $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $process.StandardOutput.BaseStream.CopyTo($stream) } finally { $stream.Dispose() }
  $process.WaitForExit()
  $null = $errorTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) { throw 'pg_dump failed; check the isolated PostgreSQL service and configuration' }
  $process.Dispose()
  if ((Get-Item -LiteralPath $temporary).Length -eq 0) { throw 'Backup is empty' }
  $verifyInfo = [Diagnostics.ProcessStartInfo]::new('docker')
  $verifyInfo.UseShellExecute = $false
  $verifyInfo.CreateNoWindow = $true
  $verifyInfo.RedirectStandardInput = $true
  $verifyInfo.RedirectStandardOutput = $true
  $verifyInfo.RedirectStandardError = $true
  foreach ($argument in ($composeArgs + @('exec', '-T', 'marketpilot-postgres', 'pg_restore', '--list'))) { $verifyInfo.ArgumentList.Add($argument) }
  $verifyProcess = [Diagnostics.Process]::Start($verifyInfo)
  $outputTask = $verifyProcess.StandardOutput.ReadToEndAsync()
  $verifyErrorTask = $verifyProcess.StandardError.ReadToEndAsync()
  $inputStream = [IO.File]::OpenRead($temporary)
  try { $inputStream.CopyTo($verifyProcess.StandardInput.BaseStream) } finally { $inputStream.Dispose(); $verifyProcess.StandardInput.Close() }
  $verifyProcess.WaitForExit()
  $null = $outputTask.GetAwaiter().GetResult()
  $null = $verifyErrorTask.GetAwaiter().GetResult()
  if ($verifyProcess.ExitCode -ne 0) { throw 'pg_restore could not read the dump archive' }
  $verifyProcess.Dispose()
  Move-Item -LiteralPath $temporary -Destination $target
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($target + '.sha256', $hash + '  ' + [IO.Path]::GetFileName($target) + "`n", [Text.UTF8Encoding]::new($false))
  # Non-recursive retention: verified full paths and exact owned filename pattern only.
  $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
  foreach ($candidate in (Get-ChildItem -LiteralPath $resolvedRoot -File)) {
    if ($candidate.Name -cnotmatch '^marketpilot-[0-9]{8}T[0-9]{6}Z\.dump$' -or $candidate.LastWriteTimeUtc -ge $cutoff -or ($candidate.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }
    $candidatePath = [IO.Path]::GetFullPath($candidate.FullName)
    if ([IO.Path]::GetDirectoryName($candidatePath) -ne $resolvedRoot) { throw 'Retention target escaped backup directory' }
    Remove-Item -LiteralPath $candidatePath
    $checksumPath = $candidatePath + '.sha256'
    if (Test-Path -LiteralPath $checksumPath -PathType Leaf) { Remove-Item -LiteralPath $checksumPath }
  }
  Write-Output ('Validated backup: ' + $target)
} finally {
  if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary }
}

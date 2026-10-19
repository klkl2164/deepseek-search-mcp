param([string]$InstallerPath, [string]$ResultPath, [string]$Mode)
$ErrorActionPreference = 'Stop'
$global:taskInstallerCalls = [System.Collections.Generic.List[object]]::new()
$global:taskInstallerMode = $Mode

# Mock only the mutating external commands. Node/version and path resolution stay real.
function global:npm.cmd {
  $global:taskInstallerCalls.Add(@('npm') + $args)
  $global:LASTEXITCODE = 0
  if ($global:taskInstallerMode -eq 'build-failure' -and $args[0] -eq 'run') { $global:LASTEXITCODE = 1 }
}
function global:claude {
  $global:taskInstallerCalls.Add(@('claude') + $args)
  $global:LASTEXITCODE = 0
  if ($global:taskInstallerMode -eq 'registration-failure') { $global:LASTEXITCODE = 1 }
}

# This is confined to this test process; no user credential is read or changed.
$env:DEEPSEEK_API_KEY = 'installer-test-placeholder'
$taskSuccess = $false
$taskFailure = $null
try {
  if ($Mode -eq 'key-only') { & $InstallerPath -SkipKeyPrompt -ConfigureKeyOnly }
  else { & $InstallerPath -SkipKeyPrompt }
  $taskSuccess = $true
} catch {
  $taskFailure = $_.Exception.Message
}
@{ success = $taskSuccess; failure = $taskFailure; calls = @($global:taskInstallerCalls.ToArray()) } |
  ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ResultPath -Encoding UTF8

[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$SkipKeyPrompt,
  [switch]$ConfigureKeyOnly,
  [switch]$SkipRoutingRules
)

$ErrorActionPreference = 'Stop'
$taskProjectPath = $PSScriptRoot
if ($CheckOnly -and $ConfigureKeyOnly) { throw 'Choose either -CheckOnly or -ConfigureKeyOnly.' }
if (-not $ConfigureKeyOnly) {
  $taskNode = Get-Command node.exe -ErrorAction Stop
  $taskNpm = Get-Command npm.cmd -ErrorAction Stop
  $taskClaude = Get-Command claude -ErrorAction Stop
  $taskVersion = & $taskNode -p 'process.versions.node'
  if ($LASTEXITCODE -ne 0 -or [version]$taskVersion -lt [version]'22.12.0') {
    throw 'Node.js 22.12 or newer is required.'
  }
}
$taskEntryPath = Join-Path $taskProjectPath 'dist\index.js'

if ($CheckOnly) {
  Write-Host 'Check passed. Installation would build and register deepseek-web, then install native-first fallback rules unless -SkipRoutingRules is set.'
  Write-Host ('Node: ' + $taskNode.Source)
  Write-Host ('Entry: ' + $taskEntryPath)
  Write-Host 'No credentials, environment variables or Claude Code settings were changed.'
  return
}

Push-Location -LiteralPath $taskProjectPath
try {
  if (-not $ConfigureKeyOnly) {
    Write-Host '[1/3] Installing dependencies and building...'
    & $taskNpm ci --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Registration was not attempted.' }
    & $taskNpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. Registration was not attempted.' }
    if (-not (Test-Path -LiteralPath $taskEntryPath -PathType Leaf)) { throw 'Built entry point is missing.' }
  }

  Write-Host 'Configuring the independent DeepSeek API key...'
  if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
    $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
  }
  if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY) -and -not $SkipKeyPrompt) {
    $taskSecureKey = Read-Host 'Enter your official DeepSeek API key (hidden; Enter skips)' -AsSecureString
    $taskKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureKey)
    try {
      $taskKeyValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskKeyPointer).Trim()
      if ($taskKeyValue) {
        if ($taskKeyValue -match '\s|[\x00-\x1f\x7f]') { throw 'API key contains invalid whitespace or control characters.' }
        [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', $taskKeyValue, 'User')
        $env:DEEPSEEK_API_KEY = $taskKeyValue
      }
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskKeyPointer)
      Remove-Variable taskSecureKey, taskKeyPointer, taskKeyValue -ErrorAction SilentlyContinue
    }
  }

  if ($ConfigureKeyOnly) {
    Write-Host 'Key configuration complete. Restart the process that launches your MCP client.'
    return
  }
  Write-Host '[3/3] Registering deepseek-web in Claude Code...'
  & $taskClaude mcp add --transport stdio --scope user deepseek-web -- $taskNode.Source $taskEntryPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Registration failed. If deepseek-web already exists, inspect it with: claude mcp get deepseek-web'
  }
  if (-not $SkipRoutingRules) {
    & $taskNode $taskEntryPath --install-claude-rules
    if ($LASTEXITCODE -ne 0) { throw 'MCP registered, but routing rules could not be installed. Resolve the rule file conflict and run --install-claude-rules again.' }
  }
  Write-Host 'Installed. Restart Claude Code, then check /mcp.'
  if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
    Write-Host 'API key was skipped. Set DEEPSEEK_API_KEY before using search/fetch.'
  }
} finally {
  Pop-Location
}

[CmdletBinding()]
param([switch]$CheckOnly, [switch]$Rules)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskEnvPath = Join-Path $PSScriptRoot '.env'
$settings = @{}
if (Test-Path -LiteralPath $taskEnvPath) {
  foreach ($line in [IO.File]::ReadAllLines($taskEnvPath)) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
  }
}
function Save-Setting([string]$Name, [string]$Value) {
  if ($Value.Contains("`r") -or $Value.Contains("`n")) { throw 'Configuration values must be single-line.' }
  $lines = if (Test-Path -LiteralPath $taskEnvPath) { [IO.File]::ReadAllLines($taskEnvPath) } else { [IO.File]::ReadAllLines((Join-Path $PSScriptRoot '.env.example')) }
  $found = $false
  $lines = @($lines | ForEach-Object { if ($_ -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) { $found = $true; "$Name=$Value" } else { $_ } })
  if (-not $found) { $lines += "$Name=$Value" }
  [IO.File]::WriteAllLines($taskEnvPath, $lines, [Text.UTF8Encoding]::new($false))
  $settings[$Name] = $Value
}
if (-not $Rules -and (!$settings['LLM_PROVIDER'] -or $settings['LLM_PROVIDER'] -eq 'disabled')) {
  if ($CheckOnly) { throw 'AI is disabled. Run .\start-demo.ps1 to configure a local OpenAI key, or use -Rules explicitly.' }
  $secureKey = Read-Host 'OpenAI API key (hidden; stored only in ignored .env)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($key)) { throw 'An API key is required for AI mode.' }
    Save-Setting 'LLM_API_KEY' $key
  } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $key = $null; $secureKey.Dispose() }
  Save-Setting 'LLM_PROVIDER' 'openai'
  # A newly entered OpenAI key must not inherit a previous local/custom provider URL.
  Save-Setting 'LLM_BASE_URL' 'https://api.openai.com/v1'
  Save-Setting 'LLM_MODEL' 'gpt-4.1-mini'
  Save-Setting 'ALLOW_EXTERNAL_LLM' 'true'
  Save-Setting 'LLM_TIMEOUT_MS' '6000'
}
if (-not $Rules -and $settings['LLM_PROVIDER'] -eq 'openai' -and (!$settings['LLM_API_KEY'] -or $settings['ALLOW_EXTERNAL_LLM'] -ne 'true')) {
  throw 'OpenAI mode requires LLM_API_KEY and ALLOW_EXTERNAL_LLM=true in the root .env. No secret values are printed.'
}
if ($CheckOnly) {
  Write-Host 'Configuration check passed. This does not validate the key with the provider or make a paid request.'
  exit 0
}
# Rules is an explicit, temporary launch mode. Existing saved AI settings remain intact.
if ($Rules) { & docker compose -f compose.yaml -f compose.rules.yaml up --build -d --wait }
else { & docker compose up --build -d --wait }
if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed. Review the preceding service output.' }
$port = if ($env:PORT) { $env:PORT } elseif ($settings['PORT']) { $settings['PORT'] } else { '3001' }
$frontPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } elseif ($settings['FRONTEND_PORT']) { $settings['FRONTEND_PORT'] } else { '3000' }
$health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health/ready" -TimeoutSec 10
$healthData = if ($health.data) { $health.data } else { $health }
if (-not $Rules -and $healthData.llm.capability -ne 'configured') { throw 'Application started, but the API reports that AI is not configured. Check the root .env and restart.' }
Write-Host "Ready: http://localhost:$frontPort"
Write-Host 'Readiness checks configuration and database access. A generated recommendation confirms live provider operation; fallback is labelled in the UI.'

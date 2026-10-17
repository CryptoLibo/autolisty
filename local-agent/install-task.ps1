param(
  [string]$AgentRoot = "C:\AutolistyAgent",
  [Parameter(Mandatory = $true)]
  [string]$AutobuildyExecutable,
  [string]$ServerUrl = "https://autolisty.com",
  [string]$AgentId = "old-production-pc",
  [string]$AgentName = "Old production PC"
)

$ErrorActionPreference = "Stop"
$taskName = "Autolisty Production Agent"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nodeMajor = [int]((& $node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Installed major version: $nodeMajor"
}

$resolvedAutobuildy = (Resolve-Path -LiteralPath $AutobuildyExecutable).Path
$appRoot = Join-Path $AgentRoot "app"
$secretsRoot = Join-Path $AgentRoot "secrets"
$tokenPath = Join-Path $secretsRoot "agent-token.txt"
$configPath = Join-Path $AgentRoot "config.json"

New-Item -ItemType Directory -Path $appRoot, $secretsRoot, (Join-Path $AgentRoot "logs"), (Join-Path $AgentRoot "state"), (Join-Path $AgentRoot "jobs") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot "agent.mjs") -Destination (Join-Path $appRoot "agent.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot "run-agent.ps1") -Destination (Join-Path $appRoot "run-agent.ps1") -Force

if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
  throw "Create $tokenPath with the machine token before installing the task."
}

$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if ($token.Length -lt 32) {
  throw "The machine token file is empty or invalid."
}

$config = [ordered]@{
  serverUrl = $ServerUrl.TrimEnd("/")
  agentId = $AgentId
  agentName = $AgentName
  tokenFile = $tokenPath
  autobuildyExecutable = $resolvedAutobuildy
  spoolRoot = $AgentRoot
  pollIntervalSeconds = 30
  heartbeatIntervalSeconds = 60
}
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

& icacls.exe $secretsRoot /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
& icacls.exe $tokenPath /inheritance:r /grant:r "${env:USERNAME}:F" | Out-Null

$actionArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$appRoot\run-agent.ps1`" -AgentRoot `"$AgentRoot`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Installed '$taskName'. It starts at logon in the interactive Photoshop session."
Write-Output "Start manually with: Start-ScheduledTask -TaskName '$taskName'"

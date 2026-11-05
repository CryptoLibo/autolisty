param(
  [string]$AgentRoot = "C:\Automaty\agent"
)

$ErrorActionPreference = "Stop"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$agent = Join-Path $AgentRoot "app\agent.mjs"
$config = Join-Path $AgentRoot "config.json"

if (-not (Test-Path -LiteralPath $agent -PathType Leaf)) {
  throw "Agent runner not found: $agent"
}
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
  throw "Agent configuration not found: $config"
}

# Cualquier error de arranque (antes de que exista agent.log) queda en agent-console.log.
$logs = Join-Path $AgentRoot "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
& $node $agent --config $config *>> (Join-Path $logs "agent-console.log")
exit $LASTEXITCODE

param(
  [string]$AgentRoot = "C:\AutolistyAgent"
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

& $node $agent --config $config
exit $LASTEXITCODE

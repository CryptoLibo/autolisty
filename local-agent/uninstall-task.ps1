$ErrorActionPreference = "Stop"
$taskName = "Autolisty Production Agent"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Removed '$taskName'. Runtime files were preserved."
} else {
  Write-Output "'$taskName' is not installed."
}

# Ventana de inicio de Automaty: al encender, decide si el PC es para ti o para la automatización.
#
# - "Lo uso yo": crea MANUAL_MODE. El agente no produce ni apaga el PC hasta que vuelvas
#   a automatización (botón) o hasta el próximo encendido.
# - "Automatización" o no tocar nada durante -ChoiceSeconds: sigue la automatización.
# - Si en automatización el agente no da señales de vida en -WatchdogMinutes, apaga el PC
#   (la automatización no arrancó y nadie lo está usando).
param(
  [string]$AgentRoot = "C:\Automaty\agent",
  [int]$ChoiceSeconds = 180,
  [int]$WatchdogMinutes = 10
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$manualPath = Join-Path $AgentRoot "MANUAL_MODE"
$noShutdownPath = Join-Path $AgentRoot "NO_SHUTDOWN"
$agentLog = Join-Path $AgentRoot "logs\agent.log"
$startedAt = Get-Date

# Cada encendido empieza en automático: la elección del día anterior no se arrastra.
Remove-Item -LiteralPath $manualPath -Force -ErrorAction SilentlyContinue

$gold = [System.Drawing.Color]::FromArgb(238, 186, 43)
$ground = [System.Drawing.Color]::FromArgb(20, 20, 22)
$text = [System.Drawing.Color]::FromArgb(237, 237, 237)
$muted = [System.Drawing.Color]::FromArgb(161, 161, 170)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Automaty"
$form.Size = New-Object System.Drawing.Size(440, 250)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = $ground
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Automaty se ha encendido"
$title.ForeColor = $text
$title.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 20)
$form.Controls.Add($title)

$info = New-Object System.Windows.Forms.Label
$info.ForeColor = $muted
$info.Size = New-Object System.Drawing.Size(390, 44)
$info.Location = New-Object System.Drawing.Point(24, 58)
$form.Controls.Add($info)

$manualButton = New-Object System.Windows.Forms.Button
$manualButton.Text = "Lo uso yo"
$manualButton.Size = New-Object System.Drawing.Size(185, 48)
$manualButton.Location = New-Object System.Drawing.Point(24, 120)
$manualButton.FlatStyle = "Flat"
$manualButton.ForeColor = $text
$manualButton.BackColor = [System.Drawing.Color]::FromArgb(36, 36, 40)
$form.Controls.Add($manualButton)

$autoButton = New-Object System.Windows.Forms.Button
$autoButton.Text = "Automatización"
$autoButton.Size = New-Object System.Drawing.Size(185, 48)
$autoButton.Location = New-Object System.Drawing.Point(222, 120)
$autoButton.FlatStyle = "Flat"
$autoButton.ForeColor = [System.Drawing.Color]::Black
$autoButton.BackColor = $gold
$form.Controls.Add($autoButton)

$footer = New-Object System.Windows.Forms.Label
$footer.ForeColor = $muted
$footer.AutoSize = $true
$footer.Location = New-Object System.Drawing.Point(24, 180)
$form.Controls.Add($footer)

$script:remaining = $ChoiceSeconds
$script:mode = "choosing"
$script:watchdogUntil = $null

function Format-Remaining([int]$seconds) {
  return "{0}:{1:D2}" -f [math]::Floor($seconds / 60), ($seconds % 60)
}

function Set-Choosing {
  $info.Text = "Si no eliges nada, sigue la automatización: produce la cola y se apaga sola al terminar."
  $footer.Text = "Automatización en " + (Format-Remaining $script:remaining)
}

function Enter-Manual {
  $script:mode = "manual"
  New-Item -ItemType File -Path $manualPath -Force | Out-Null
  $title.Text = "Modo manual"
  $info.Text = "Automaty no producirá ni apagará el PC. Apágalo tú al terminar."
  $manualButton.Visible = $false
  $autoButton.Text = "Volver a automatización"
  $autoButton.Size = New-Object System.Drawing.Size(383, 48)
  $autoButton.Location = New-Object System.Drawing.Point(24, 120)
  $footer.Text = "Puedes minimizar esta ventana."
  $form.TopMost = $false
}

function Enter-Automatic {
  $script:mode = "automatic"
  Remove-Item -LiteralPath $manualPath -Force -ErrorAction SilentlyContinue
  $script:watchdogUntil = (Get-Date).AddMinutes($WatchdogMinutes)
  $form.Hide()
}

# ¿El agente ha escrito en su registro desde que arrancó esta ventana? (= está vivo)
function Test-AgentAlive {
  if (-not (Test-Path -LiteralPath $agentLog)) { return $false }
  return (Get-Item -LiteralPath $agentLog).LastWriteTime -gt $startedAt
}

$manualButton.Add_Click({ Enter-Manual })
$autoButton.Add_Click({ Enter-Automatic })
$form.Add_FormClosing({
  param($sender, $eventArgs)
  # Cerrar con la X mientras se elige = automatización; en modo manual, cerrar mantiene el modo manual.
  if ($script:mode -eq "choosing") { Enter-Automatic; $eventArgs.Cancel = $true }
  elseif ($script:mode -eq "automatic" -and $script:watchdogUntil) { $eventArgs.Cancel = $true; $form.Hide() }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  if ($script:mode -eq "choosing") {
    $script:remaining -= 1
    if ($script:remaining -le 0) { Enter-Automatic } else { Set-Choosing }
    return
  }
  if ($script:mode -eq "automatic" -and $script:watchdogUntil) {
    if (Test-AgentAlive) {
      # El agente está trabajando: él decide cuándo apagar. La ventana termina aquí.
      $script:watchdogUntil = $null
      $timer.Stop()
      $form.Dispose()
      [System.Windows.Forms.Application]::ExitThread()
      return
    }
    if ((Get-Date) -ge $script:watchdogUntil) {
      $script:watchdogUntil = $null
      $timer.Stop()
      if (-not (Test-Path -LiteralPath $noShutdownPath)) {
        & shutdown.exe /s /t 60 /c "Automaty: la automatización no arrancó en $WatchdogMinutes minutos. Se apaga."
      }
      [System.Windows.Forms.Application]::ExitThread()
    }
  }
})

Set-Choosing
$timer.Start()
[System.Windows.Forms.Application]::Run($form)

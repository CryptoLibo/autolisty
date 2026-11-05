# Instalación de Automaty

Guía para dejar Automaty (el PC de producción) listo para procesar la cola de Autolisty. Todo lo que corre en Automaty vive en `C:\Automaty`, fuera del escritorio, y se actualiza con `git pull`.

## 1. Software

| Programa | Notas |
|---|---|
| **Git para Windows** | Para clonar y actualizar los repositorios. |
| **Node.js 22 LTS** | Lo usan el agente y la compilación de Autobuildy. |
| **Photoshop 2026** | Misma cuenta de Adobe que en tu PC. La licencia individual permite tener la sesión iniciada en dos equipos pero **usar Photoshop en uno solo a la vez**: no lo uses en tu PC mientras Automaty produce. |
| **Upscayl 2.15 o posterior** | Instalación por defecto en `C:\Program Files\Upscayl`. Comprueba que existe `C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe`; si está en otra ruta, indícala en el paso 4. Necesita una GPU con Vulkan. |

Configuración de Windows: usuario dedicado con **inicio de sesión automático** (Photoshop necesita una sesión de escritorio), **suspensión desactivada** y actualizaciones automáticas fuera de la ventana de producción.

## 2. Carpetas

```text
C:\Automaty\
  autobuildy\                      ← git clone (código)
  automocky\                       ← git clone (script) + Mockups\ y Videos\ copiados a mano
  autolisty\                       ← git clone (solo se usa local-agent\)
  LBCreaStudio\<Producto>\Mockups\ ← copiar desde tu PC: vistas previas que Autobuildy usa para elegir mockups
  LBCreaStudio\<Producto>\Listings\ ← lo crea Autobuildy; cada listing se borra al completar el flujo
  agent\                           ← cola local, temporales, logs, configuración y token del agente
```

`<Producto>` son las carpetas que ya tienes en tu escritorio: `Vertical Wall Art`, `Horizontal Wall Art`, `Nursery Wall Art`, `Frame TV Art`, `PNG Designs`.

```powershell
New-Item -ItemType Directory -Force C:\Automaty | Out-Null
cd C:\Automaty
git clone https://github.com/CryptoLibo/Autobuildy.git autobuildy
git clone https://github.com/CryptoLibo/Automocky.git automocky
git clone https://github.com/CryptoLibo/autolisty.git autolisty
```

Copia desde tu PC (memoria USB, red o disco externo):
- `Desktop\Automocky\Mockups\*` → `C:\Automaty\automocky\Mockups\`
- `Desktop\Automocky\Videos\*` → `C:\Automaty\automocky\Videos\`
- `Desktop\LBCreaStudio\<Producto>\Mockups\` → `C:\Automaty\LBCreaStudio\<Producto>\Mockups\` (solo las carpetas `Mockups`, no `Listings`)

## 3. Compilar Autobuildy

```powershell
cd C:\Automaty\autobuildy
npm.cmd ci
npm.cmd run pack
```

El ejecutable queda en `C:\Automaty\autobuildy\release\win-unpacked\Autobuildy.exe`. No hace falta el instalador.

## 4. Configuración de Autobuildy para Automaty

Crea `%APPDATA%\Autobuildy\autobuildy.config.json`:

```json
{
  "desktopRoot": "C:\\Automaty",
  "studioRoot": "C:\\Automaty\\LBCreaStudio",
  "automockyRoot": "C:\\Automaty\\automocky",
  "assetsRoot": "C:\\Automaty\\autobuildy\\assets",
  "downloadsRoot": "C:\\Automaty\\downloads"
}
```

Si Upscayl o Photoshop están en otra ruta, añade `upscaylExecutable`, `upscaylModelsPath` o `photoshopExecutable`.

## 5. Token del agente

En el servidor (genera un token nuevo y su huella):

```bash
TOKEN=$(openssl rand -hex 32)
echo "TOKEN (para Automaty): $TOKEN"
echo "HASH (para el servidor): $(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)"
```

- En `~/autolisty/.env.local` del servidor: `AUTOMATION_AGENT_TOKEN_SHA256=<HASH>` y luego `pm2 restart autolisty --update-env`.
- En Automaty: crea `C:\Automaty\agent\secrets\agent-token.txt` con el TOKEN en una sola línea.

## 6. Instalar el agente

PowerShell **como administrador**:

```powershell
cd C:\Automaty\autolisty\local-agent
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

Crea la tarea programada **Automaty Production Agent**, que arranca al iniciar sesión, y protege el token. Para que Windows se apague solo al terminar la cola, añade `-ShutdownWhenIdleMinutes 15`.

## 7. Primera prueba

1. Abre Photoshop una vez a mano y cierra cualquier diálogo inicial (fuentes, perfiles de color, novedades).
2. Arranca el agente: `Start-ScheduledTask -TaskName "Automaty Production Agent"`.
3. En Autolisty → Automation debe aparecer **Automaty · Online**.
4. Aprueba un diseño. En el siguiente ciclo (≤30 s) pasa a "In Automaty's local queue" y empieza la producción.
5. Log en vivo: `Get-Content C:\Automaty\agent\logs\agent.log -Wait`.

## Cómo funciona cada día

1. Automaty se enciende e inicia sesión; el agente arranca solo.
2. Sincroniza: recibe **todos** los diseños aprobados, descarga sus fuentes y los produce en orden (prioridad primero, luego antigüedad). Cada 30 s vuelve a sincronizar y añade los que apruebes mientras está encendido.
3. Cada listing terminado se sube a R2 y el servidor continúa (draft, SEO, Pinterest) sin esperar a Automaty.
4. En cada sincronización borra las carpetas locales de los listings que ya completaron todo el flujo.
5. **Pausar** en Automation: termina el listing en curso y no empieza otro. Un fallo de Photoshop o Upscayl pausa la producción para no repetirlo en toda la cola.
6. Sin conexión: el agente espera y continúa desde el último punto guardado; nunca repite un listing ya subido.

## Actualizar

Con la producción en pausa y sin listing en curso:

```powershell
cd C:\Automaty\autobuildy; git pull; npm.cmd ci; npm.cmd run pack
cd C:\Automaty\automocky; git pull
cd C:\Automaty\autolisty; git pull
Copy-Item .\local-agent\agent.mjs C:\Automaty\agent\app\agent.mjs -Force
Stop-ScheduledTask "Automaty Production Agent"; Start-ScheduledTask "Automaty Production Agent"
```

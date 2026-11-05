# Instalación de Automaty, paso a paso

Guía para dejar Automaty (el PC de producción) listo para procesar la cola de Autolisty. Sigue los pasos en orden; cada uno dice qué hacer, cómo comprobar que salió bien y qué hacer si algo falla.

**Qué necesitas a mano:** Automaty con internet, tu PC de trabajo (para copiar los mockups), una memoria USB o disco externo, y acceso al servidor por SSH (como cuando haces deploy).

**Cómo abrir PowerShell:** menú Inicio → escribe `PowerShell` → **Windows PowerShell**. Cuando un paso diga "como administrador": clic derecho → **Ejecutar como administrador**. Para pegar un comando: copia aquí, clic derecho dentro de la ventana de PowerShell, Enter.

---

## Paso 1. Instalar Git

Git descarga el código de GitHub y lo mantiene actualizado.

1. Entra en **https://git-scm.com/download/win** → descarga **64-bit Git for Windows Setup**.
2. Ejecuta el instalador y deja **todas las opciones por defecto** (Next, Next… Install).
3. Comprueba: abre PowerShell nuevo y ejecuta `git --version` → debe mostrar algo como `git version 2.x`.

## Paso 2. Instalar Node.js

Node ejecuta el agente de Automaty y compila Autobuildy.

1. Entra en **https://nodejs.org** → descarga la versión **LTS** (22 o superior) para Windows (archivo `.msi`).
2. Instala con las opciones por defecto. Si ofrece "Tools for Native Modules", puedes dejarlo desmarcado.
3. Comprueba en un PowerShell **nuevo**: `node --version` → `v22.x` o superior.

## Paso 3. Photoshop

1. Instala **Photoshop 2026** desde la app Creative Cloud con **tu misma cuenta de Adobe**.
2. Importante: la licencia individual permite tener la sesión en dos equipos, pero **usar Photoshop en uno solo a la vez**. No lo uses en tu PC mientras Automaty está produciendo.
3. Ábrelo una vez a mano y cierra todos los avisos iniciales (novedades, inicio de sesión, etc.). Ciérralo.

## Paso 4. Instalar Upscayl y comprobar la GPU

Upscayl amplía los diseños con IA. Usa la tarjeta gráfica (la GTX 1050 Ti de Automaty es compatible: soporta Vulkan, que es lo que Upscayl necesita; será más lento que una gráfica moderna, pero suficiente).

1. **Actualiza el driver de la gráfica:** entra en **https://www.nvidia.com/Download/index.aspx**, elige GeForce → GeForce 10 Series → GeForce GTX 1050 Ti → Windows → descarga e instala. (Upscayl necesita un driver reciente con Vulkan.)
2. **Descarga Upscayl:** entra en **https://github.com/upscayl/upscayl/releases** → en la versión más reciente (2.15 o superior), abre **Assets** y descarga el archivo **`.exe`** de Windows.
3. Instálalo en la ruta por defecto (`C:\Program Files\Upscayl`).
4. **Los modelos vienen incluidos** con Upscayl (Upscayl Standard, Lite, High Fidelity, Remacri, Ultramix, Ultrasharp, Digital Art); no hay que descargarlos aparte.
5. Comprueba que existen estos dos elementos (pega en PowerShell):
   ```powershell
   Test-Path "C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe"
   Get-ChildItem "C:\Program Files\Upscayl\resources\models" | Select-Object -ExpandProperty Name
   ```
   El primero debe responder `True`. El segundo debe listar archivos como `remacri-4x.bin`, `remacri-4x.param`, `upscayl-standard-4x.bin`, `high-fidelity-4x.bin`… **Copia esa lista y pásamela**: con ella elegimos el modelo final.
6. **Prueba la GPU:** abre Upscayl, arrastra cualquier imagen, elige un modelo y pulsa **Upscayl**. Si termina y muestra el resultado, la GPU funciona. Si da error, dime el mensaje.

> **Modelos adicionales** (solo si más adelante elegimos uno que no viene incluido): se descargan del repositorio `upscayl/custom-models` (archivos `.bin` + `.param` con el mismo nombre) y se copian a `C:\Program Files\Upscayl\resources\models`. Por ahora no hace falta.

## Paso 5. Descargar el código (clonar los repositorios)

Ya tienes creadas las carpetas `C:\Automaty\autobuildy`, `C:\Automaty\automocky` y `C:\Automaty\autolisty`. Para clonar dentro de una carpeta que ya existe, entra en ella y termina el comando con un **punto** (`.`), que significa "aquí mismo". La carpeta debe estar **vacía**.

Los repositorios son privados: la **primera vez** se abrirá una ventana del navegador para iniciar sesión en GitHub (cuenta CryptoLibo) y autorizar a Git. Acéptalo; las siguientes veces ya no lo pedirá.

**Autobuildy:**
```powershell
cd C:\Automaty\autobuildy
git clone https://github.com/CryptoLibo/Autobuildy.git .
```

**Automocky:**
```powershell
cd C:\Automaty\automocky
git clone https://github.com/CryptoLibo/Automocky.git .
```

**Autolisty** (solo usaremos su carpeta `local-agent`, el agente de Automaty):
```powershell
cd C:\Automaty\autolisty
git clone https://github.com/CryptoLibo/autolisty.git .
```

Comprueba: `Get-ChildItem C:\Automaty\automocky` debe mostrar `Automocky.jsx`, `README.md` y las carpetas `Mockups`, `Videos`, `Output`, etc.

**Si da el error "destination path '.' already exists and is not an empty directory":** la carpeta tiene algo dentro. Ábrela en el Explorador, mueve o borra su contenido, y repite.

**Las demás carpetas no se clonan:**
- `C:\Automaty\LBCreaStudio` → se llena en el paso 6.
- `C:\Automaty\agent` → la llena el instalador del agente (paso 10).
- Crea además una carpeta vacía `C:\Automaty\downloads` (Autobuildy la necesita aunque no la use en automático):
  ```powershell
  New-Item -ItemType Directory -Force C:\Automaty\downloads | Out-Null
  ```

## Paso 6. Copiar los mockups desde tu PC

Las bibliotecas de mockups son muy pesadas (unos 17 GB) y no están en GitHub. Cópialas con una memoria USB, un disco externo o por red:

| Desde tu PC | Hacia Automaty |
|---|---|
| `Escritorio\Automocky\Mockups\` (todo su contenido) | `C:\Automaty\automocky\Mockups\` |
| `Escritorio\Automocky\Videos\` (todo su contenido) | `C:\Automaty\automocky\Videos\` |
| `Escritorio\LBCreaStudio\Vertical Wall Art\Mockups\` | `C:\Automaty\LBCreaStudio\Vertical Wall Art\Mockups\` |
| `Escritorio\LBCreaStudio\Horizontal Wall Art\Mockups\` | `C:\Automaty\LBCreaStudio\Horizontal Wall Art\Mockups\` |
| `Escritorio\LBCreaStudio\Nursery Wall Art\Mockups\` | `C:\Automaty\LBCreaStudio\Nursery Wall Art\Mockups\` |
| `Escritorio\LBCreaStudio\Frame TV Art\Mockups\` | `C:\Automaty\LBCreaStudio\Frame TV Art\Mockups\` |
| `Escritorio\LBCreaStudio\PNG Designs\Mockups\` | `C:\Automaty\LBCreaStudio\PNG Designs\Mockups\` |

De `LBCreaStudio` copia **solo las carpetas `Mockups`**, no las de `Listings`. Al pegar en `automocky\Mockups`, si Windows pregunta por la carpeta ya existente, elige **combinar/reemplazar**.

## Paso 7. Compilar Autobuildy

Esto descarga sus dependencias y genera el programa. Tarda varios minutos la primera vez.

```powershell
cd C:\Automaty\autobuildy
npm.cmd ci
npm.cmd run pack
```

- `npm.cmd ci` instala las dependencias exactas. Verás muchas líneas; al final no debe aparecer `ERR!`.
- `npm.cmd run pack` crea el programa. Al terminar, comprueba:
  ```powershell
  Test-Path C:\Automaty\autobuildy\release\win-unpacked\Autobuildy.exe
  ```
  Debe responder `True`.

(Usamos `npm.cmd` en vez de `npm` para evitar el bloqueo de scripts de PowerShell que viste en tu PC.)

## Paso 8. Decirle a Autobuildy dónde están las cosas

En tu PC, Autobuildy busca todo en el Escritorio. En Automaty todo está en `C:\Automaty`, así que se lo indicamos con un archivo de configuración. Copia y pega **todo este bloque de una vez** en PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\Autobuildy" | Out-Null
@'
{
  "desktopRoot": "C:\\Automaty",
  "studioRoot": "C:\\Automaty\\LBCreaStudio",
  "automockyRoot": "C:\\Automaty\\automocky",
  "assetsRoot": "C:\\Automaty\\autobuildy\\assets",
  "downloadsRoot": "C:\\Automaty\\downloads"
}
'@ | Set-Content -Encoding UTF8 "$env:APPDATA\Autobuildy\autobuildy.config.json"
Get-Content "$env:APPDATA\Autobuildy\autobuildy.config.json"
```

La última línea muestra el archivo creado; debe verse igual que el bloque. (`$env:APPDATA` es la carpeta de configuración de tu usuario de Windows, normalmente `C:\Users\<usuario>\AppData\Roaming`.)

Upscayl y Photoshop no hace falta indicarlos si están en su ruta por defecto (pasos 3 y 4).

**Entregables fijos.** Lo que acompaña siempre al diseño final (en Frame TV Art, `Quick Setup Guide.pdf`) va en `C:\Automaty\autobuildy\assets\<producto>\final_files`. Autobuildy lo copia a `Diseños Finales` de cada listing. Ese PDF no está en GitHub: cópialo tú desde tu PC a `C:\Automaty\autobuildy\assets\frame_tv_art\final_files\`.

## Paso 9. Crear el token del agente

El agente se identifica ante Autolisty con un token, igual que el conector de Claude. El servidor solo guarda su huella.

**9a. En el servidor** (conéctate por SSH como cuando haces deploy) pega todo el bloque:

```bash
cd ~/autolisty
TOKEN=$(openssl rand -hex 32)
HASH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
sed -i '/^AUTOMATION_AGENT_TOKEN_SHA256=/d' .env.local
echo "AUTOMATION_AGENT_TOKEN_SHA256=$HASH" >> .env.local
pm2 restart autolisty --update-env
echo "TOKEN PARA AUTOMATY: $TOKEN"
```

Esto genera el token, guarda su huella en `.env.local` (reemplazando una anterior si existía), reinicia la app y muestra el token. **Copia el token** (64 caracteres) para el paso 9b. No lo compartas en el chat.

**9b. En Automaty**, en PowerShell, reemplaza `PEGA_AQUI_EL_TOKEN` por el token (dejando las comillas):

```powershell
New-Item -ItemType Directory -Force C:\Automaty\agent\secrets | Out-Null
Set-Content -NoNewline -Encoding ASCII C:\Automaty\agent\secrets\agent-token.txt "PEGA_AQUI_EL_TOKEN"
(Get-Content C:\Automaty\agent\secrets\agent-token.txt).Length
```

La última línea debe responder `64`.

## Paso 10. Instalar el agente como tarea automática

Abre PowerShell **como administrador** y ejecuta:

```powershell
cd C:\Automaty\autolisty\local-agent
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

Debe terminar con `Installed 'Automaty Production Agent'`. Esto:
- copia el agente a `C:\Automaty\agent\app`,
- crea `C:\Automaty\agent\config.json`,
- protege el archivo del token para que solo tu usuario pueda leerlo,
- registra una tarea que arranca el agente cada vez que inicias sesión en Windows.

**Opcional, apagado automático:** si quieres que Automaty se apague solo cuando termine la cola (15 minutos después de quedarse sin trabajo), usa en su lugar:
```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -ShutdownWhenIdleMinutes 15
```

## Paso 11. Ajustes de Windows

Photoshop solo funciona con una sesión de Windows iniciada, así que Automaty debe entrar solo y no dormirse.

**Inicio de sesión automático:**
1. Configuración → Cuentas → Opciones de inicio de sesión → desactiva **"Para mayor seguridad, permitir solo el inicio de sesión de Windows Hello…"** (si aparece).
2. Pulsa `Windows + R`, escribe `netplwiz` y Enter.
3. Selecciona tu usuario, desmarca **"Los usuarios deben escribir su nombre y contraseña para usar el equipo"** → Aceptar → escribe tu contraseña dos veces.

**Que no se suspenda:**
- Configuración → Sistema → Inicio/apagado y batería (o "Energía") → **Pantalla y suspensión** → "Poner el dispositivo en suspensión" = **Nunca**. La pantalla sí puede apagarse.

**Actualizaciones:** Configuración → Windows Update → Opciones avanzadas → **Horas activas** → pon el horario en que Automaty suele estar encendido, para que no se reinicie a mitad de producción.

## Paso 12. Primera prueba

1. Arranca el agente sin reiniciar: en PowerShell `Start-ScheduledTask -TaskName "Automaty Production Agent"`.
2. En Autolisty → **Automation**, arriba debe verse **Automaty · Online · idle** (punto verde) en menos de un minuto.
3. Mira el log en vivo (déjalo abierto en una ventana):
   ```powershell
   Get-Content C:\Automaty\agent\logs\agent.log -Wait
   ```
   Debe aparecer `Autolisty local agent started (local queue mode).`
4. Aprueba un diseño en Automation. En ≤30 segundos pasa a **"In Automaty's local queue"**, Automaty descarga la imagen y empieza: verás abrirse Photoshop.
5. Al terminar, el diseño pasa a **"Local production complete"**.

Si algo falla, el diseño queda en **"Needs attention"** con el error, la producción se pausa y el log muestra el detalle: pásame las últimas líneas del log.

---

## Cómo funciona cada día

1. Enciendes Automaty; Windows inicia sesión solo y el agente arranca.
2. El agente sincroniza: recibe **todos** los diseños aprobados, descarga sus imágenes y los produce en orden (los priorizados primero). Cada 30 segundos vuelve a mirar si aprobaste más.
3. Cada listing terminado se sube a R2 y el servidor continúa con draft, SEO y Pinterest sin esperar a Automaty.
4. Las carpetas locales de los listings que ya completaron todo el flujo se borran en la siguiente sincronización.
5. **Pausar producción** en Automation: termina el listing en curso y no empieza otro. Un fallo de Photoshop o Upscayl también pausa, para no repetir el error en toda la cola.
6. Si se cae internet, el agente espera y continúa desde el último punto guardado; nunca repite un listing ya subido.

## Actualizar Automaty

Cuando te avise de una actualización, con la producción **en pausa** y sin listing en curso, en PowerShell:

```powershell
cd C:\Automaty\autobuildy; git pull; npm.cmd ci; npm.cmd run pack
cd C:\Automaty\automocky; git pull
cd C:\Automaty\autolisty; git pull
Copy-Item .\local-agent\agent.mjs C:\Automaty\agent\app\agent.mjs -Force
Stop-ScheduledTask "Automaty Production Agent"; Start-ScheduledTask "Automaty Production Agent"
```

Luego reanuda la producción en Automation.

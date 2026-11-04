# Ecosistema LBCreaStudio

Documento de referencia del sistema completo: qué hace cada pieza, cómo viaja un diseño de principio a fin, el estado actual verificado en el código y el plan de trabajo. Mantenido por Claude. Última revisión: 2026-11-04.

## 1. Piezas

| Pieza | Repositorio | Dónde corre | Responsabilidad |
|---|---|---|---|
| **Claude** | — | Nube (sesiones y tareas programadas) | Investigación de mercado (Alura), decisión de qué crear, diseño en Kittl, envío a Autolisty, revisión de drafts |
| **Autolisty** | `CryptoLibo/autolisty` | Hetzner, `autolisty.com` | Cola de producción (SQLite), R2, SEO (OpenAI), PDF de entrega, drafts Etsy, Pinterest, dashboard |
| **Agente local** | `autolisty/local-agent` | Automaty | Heartbeat, claim de trabajos, descarga de la fuente, lanza Autobuildy, valida y sube la carpeta final a R2 |
| **Autobuildy** | `CryptoLibo/autobuildy` | Automaty (y PC de trabajo en modo manual) | Prepara la carpeta del listing, Upscayl, lanza Automocky, ensambla mockups, pines y entregables |
| **Automocky** | `CryptoLibo/automocky` | Photoshop en Automaty | Recortes a medidas exactas a 300 DPI, mockups desde PSD, vídeos, limpieza de PNG |
| **Automaty** | — | PC dedicado en casa (Windows) | Se enciende una vez al día y procesa la cola |

Todo el tráfico de Automaty es saliente por HTTPS hacia Autolisty y R2. Automaty no tiene puertos abiertos ni credenciales de Etsy, Pinterest o R2: usa un token de máquina revocable y URLs firmadas de 15 minutos.

## 2. Flujo de un diseño

1. **Claude** investiga (Alura), genera en Kittl y envía a Autolisty el diseño con su prompt, tipo de producto, keywords con métricas y colección. Por la tarde, para que haya material cuando Automaty se encienda.
2. **Aprobación** del propietario en Autolisty. Solo lo aprobado entra en la cola.
3. **Autolisty** guarda la fuente en R2 (`production-staging/{productCode}/source/`) y deja el trabajo en `QUEUED_LOCAL`.
4. **Automaty**: el agente reclama el trabajo, verifica el SHA-256 de la fuente y ejecuta `Autobuildy --automation-request`.
5. **Autobuildy + Automocky**: upscale, recortes finales, mockups, pines y carpeta del listing. Checkpoints por etapa para continuar tras un reinicio.
6. El agente valida los slots obligatorios, sube cada archivo a R2 con URL firmada y Autolisty confirma tamaño y hash → `LOCAL_COMPLETE`.
7. **Autolisty**: asigna un draft del pool por producto, genera el SEO de Etsy y Pinterest, el PDF de entrega y sincroniza el draft.
8. **Revisión del draft** (Claude vía MCP, pendiente) y publicación.
9. Autolisty detecta la URL publicada y publica los pines.

Identidad: cada diseño recibe un código inmutable `LBCreaStudio-XXXXXX` al entrar en Autolisty; es el mismo en la cola, la carpeta local, Etsy, Pinterest y R2.

## 3. Especificaciones de producción (verificadas en el código)

**Medidas finales** (`Automocky/AutomockyProgramFiles/AutomockyMemory.txt`, 300 DPI):

| Producto | Archivos |
|---|---|
| Vertical y Nursery | 2x3 = 5600×8400 · 3x4 = 6000×8000 · 4x5 = 6000×7500 · 5x7 ISO = 6000×8400 · 11x14 = 6000×7637 |
| Horizontal | 3x2 = 8400×5600 · 4x3 = 8000×6000 · 5x4 = 7500×6000 · 7x5 ISO = 8400×6000 · 14x11 = 7637×6000 |
| Frame TV | 4K = 3840×2160 (`FrameTVArt.jpg`) |
| PNG Designs | `Design.png` original, sin upscale |

**Upscale:** Autobuildy llama a Upscayl con el modelo `remacri-4x` sin indicar escala, así que amplía **4x**. Se aplica a todo salvo PNG (`skipUpscayl`).

**Recorte:** `resizeDocumentToTarget` escala la imagen hasta cubrir el formato y recorta **siempre al centro**. El máster debe generarse en el formato más alargado (2:3 vertical, 3:2 horizontal) con el sujeto dentro de la franja central del 80%, ya que 4x5 conserva solo el 83% del lado largo.

**PNG:** `cleanAndSavePngDesign` quita el fondo con varita mágica desde 8 puntos del borde (tolerancia 80). Falla si el diseño toca el borde o se parece al fondo.

**Estructura de carpeta reconocida por Autolisty:** mockups numerados en la raíz (`1.jpg`, `2.mp4` vídeo opcional, `3.jpg`…), `Pines/`, `Diseños Finales/`, `Midjourney.png` como diseño principal. Slots generados 1, 3, 4, 6, 7, 9, 10; fijos 5, 8, 11 (de `autobuildy/assets/*/root_media`); 3 pines. Ver `lib/automation/productContracts.ts`.

## 4. Estado actual

**Funciona y tiene pruebas:** cola SQLite con 26 estados y máquina de transiciones, pausa global, retry manual, pool de drafts Etsy por producto, autenticación del agente por bearer (hash en servidor), claim, descarga de fuente con SHA-256, subida a R2 con URL firmada y verificación, `--automation-request` en Autobuildy con checkpoints, dashboard de Etsy, Pinterest y finanzas.

**Falta o necesita corrección**, por prioridad:

1. **Entrada para Claude.** `POST /api/automation/jobs` exige sesión de GitHub y subida de archivo desde el navegador, y solo guarda `sourcePrompt`. Hace falta una ruta con token de máquina que acepte la URL de Kittl y campos nuevos: keywords y métricas, colección, anclaje de recorte, referencia Kittl y estado `PENDING_APPROVAL`.
2. **Ejecutor posterior a `LOCAL_COMPLETE`.** Los estados de draft, SEO, delivery, Etsy y Pinterest existen en `stateMachine.ts`, pero no hay ejecutor de servidor que los recorra; hoy se hace a mano desde Listing/Scale.
3. **Rutas fijas en Autobuildy.** `main.js` usa `C:\Users\…\Desktop\…` y `C:\Program Files\…`. Hay que pasarlas a un archivo de configuración por máquina, manteniendo los valores actuales como predeterminados para el modo manual.
4. **Upscale según la fuente.** Frame TV recibe 4x aunque la fuente ya supere 4K (una imagen de Kittl de 5504×3072 pasaría a ~22000×12300). Regla: escala = la mínima (1x, 2x o 4x) que alcance la medida final mayor del producto.
5. **PNG ya transparentes.** Si la fuente trae canal alfa con fondo transparente, saltar la limpieza por varita mágica.
6. **Diálogos bloqueantes.** Automocky tiene 32 `alert()`/`confirm()`. El modo automático suprime los principales, pero los de error (PSD que no abre, capa no encontrada) bloquearían Photoshop sin supervisión. Hace falta suprimirlos en modo automático y un timeout por PSD.
7. **Cola.** Es FIFO sin prioridad ni filtro por familia, y un lease vencido no se recupera solo: si Automaty se apaga a mitad de un trabajo, puede quedar retenido.
8. **Mockups al azar sin semilla** (`wall-art-mockups.js`, `assembler.js`). Al reprocesar un listing pueden salir mockups distintos; guardar la selección en el manifiesto.
9. **Frame TV** procesa toda la biblioteca de mockups y elige después; preseleccionar como en Wall Art.
10. **Bundles.** Automocky soporta `framebundle`, pero Autobuildy y Autolisty no tienen contrato multiarchivo. Requiere mockups propios y un contrato nuevo.

## 5. Instalación y actualización en Automaty

- **Código:** clonar `autobuildy` y `automocky` (y `autolisty` para el agente local) desde GitHub. Actualizar = pausar la cola, esperar a que termine el trabajo activo, `git pull`, recompilar Autobuildy, preflight, reanudar.
- **Configuración por máquina** (rutas, token, carpeta de trabajo) fuera de los repositorios.
- **Bibliotecas PSD y vídeos de mockups** (~17 GB) no van a Git: el propietario los copia manualmente de su PC a la carpeta `Mockups/` y `Videos/` correspondiente de Automaty cuando cambian.
- **Requisitos:** Photoshop con licencia y sesión de Windows iniciada (ExtendScript no funciona como servicio sin sesión), Upscayl, Node.

## 6. Reglas de trabajo

- Los cambios llegan a `main` por pull request; el despliegue en Hetzner lo ejecuta el propietario con `./deploy.sh`.
- No modificar `.env.local` ni exponer secretos.
- Conservar la estructura de carpeta reconocida, las claves de R2 y los enlaces `download.autolisty.com` salvo cambio coordinado con el Worker de Cloudflare.
- No borrar ni recrear la base de datos de Automation; las migraciones son solo aditivas.
- Mantener el modo manual de Autobuildy y Automocky funcionando mientras se añade el automático.

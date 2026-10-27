# Market Research Studio - Etapa 5: auditoria previa a Hetzner

**Estado: NO LISTO PARA APROBACION DE DEPLOY.** Este documento es una propuesta y una lista de verificaciones pendientes. No se accedio al VPS, no se respaldo ni migro su SQLite, no se instalaron servicios, no se cambio su entorno y no se desplego codigo.

## 1. Evidencia disponible

- Checkout local: rama `main`, HEAD `ed170d3`. `git ls-remote origin refs/heads/main` devuelve exactamente `ed170d3e0e49acffc2380d61a402a78d34e207ed`. Por tanto, el `main` remoto no contiene las etapas locales 1-4.3.
- Hay cambios locales sin commit: `app/page.tsx`, `lib/automation/db/migrations.ts`, `package.json`; `app/api/research/`, componentes de UI, `lib/research/`, scripts y documentos son en gran parte untracked. Tambien hay archivos ajenos a Research (`AGENTS.md`, `CLAUDE.md`, `.tmp-test/`, otros docs). No hacer `git add .` ni desplegar este arbol sin revision selectiva.
- `deploy.sh` **no existe en este checkout**. La captura compartida previamente mostraba `git pull origin main`, `npm install --silent`, `npm run build`, `pm2 restart autolisty`, `pm2 save`, pero no prueba que ese script siga igual en el VPS. No tenia `set -e`, copia de SQLite ni gestion del worker.
- `docs/GITHUB_AUTH_SETUP.md` indica despliegue manual `./deploy.sh` y PM2. `package.json` usa Next 16.3.3, `better-sqlite3` 13 y `next build --webpack`; `postbuild` ejecuta `scripts/retire-legacy-processes.mjs`, que puede retirar un PM2 legado. El VPS habia mostrado Node 22.23.3 y PM2 6.0.14 en capturas anteriores; esto **no es verificacion actual**.
- `.gitignore` excluye `data/` y `.env*`. La base local `data/autolisty-automation.sqlite` esta en esquema v10. Esto no identifica la base de produccion.

## 2. Estado funcional de Research

**Implementado y probado localmente:** UI integrada en `app/page.tsx` (`MarketResearchWorkspace` y `CreativePromptWorkspace`), rutas autenticadas de investigaciones, evidencia manual, seleccion, correcciones y Create Prompts; esquema SQLite v4-v10; bloqueo por origen y propietario; presupuestos Alura, idempotencia/leases, retencion por proveedor y worker `--once/--loop`. En 4.3 pasaron 85 pruebas, TypeScript, lint acotado y build de produccion local. El ensayo de migracion fue sobre la **base local**, no la de Hetzner.

**Implementado sin prueba real:** consultas comerciales de Alura, Etsy Research y generacion OpenAI de briefs/prompts en el VPS. La prueba local autenticada `GET /v1/usage` fallo por DNS en el sandbox de Codex; fuera de el se verifico DNS/TLS/HTTP sin credenciales, pero no se volvio a llamar al endpoint autenticado. No hay evidencia real de scopes comerciales ni de comportamiento con saldo vivo.

**Parcial o pendiente:** EverBee tiene conector pero su politica de persistencia esta PENDING y el motor bloquea su llamada antes del despacho. Google Trends y Web no tienen conector operativo. `research_knowledge` tiene API de repositorio y procedencia, pero no UI para crear/revisar conclusiones propias. El servicio systemd es solo una plantilla. La ruta de trial de Alura es deliberadamente **solo local** y devuelve 403 en produccion. La ruta de diagnostico de uso tambien es solo local. En produccion no se podra usar ese boton para verificar saldo hasta disenar y aprobar un diagnostico remoto seguro; no se debe habilitar investigacion completa para suplirlo.

**No afirmar:** que Research haya funcionado de punta a punta con llamadas reales, ni que todos los conectores esten autorizados. Listing, Scale y Automation conservan sus rutas en el build local, pero eso no sustituye pruebas de regresion en el VPS.

## 3. Bloqueos para la fase B

Falta acceso de solo lectura autorizado o salidas verificables del VPS para confirmar:

1. Commit desplegado real, `git status`, contenido actual de `deploy.sh` y rama de despliegue. El commit remoto no prueba por si solo el contenido activo del proceso PM2.
2. Versiones actuales Node/npm/PM2, estado y modo de reinicio de `autolisty`, unidad/servicio existente, configuracion efectiva de Nginx y salud de Listing/Scale/Automation.
3. **Valor de ruta**, no contenido, de `AUTOMATION_DB_PATH`; si esta fuera del checkout, version SQLite, `integrity_check`, recuentos por tabla, propietario/permisos y espacio disponible. `/var/lib/autolisty/automation.sqlite` es un ejemplo documental, no una ruta confirmada.
4. Nombres presentes (nunca valores) de `AUTH_SECRET`, OAuth, `AUTOMATION_DB_PATH`, R2, Etsy, OpenAI, `ALURA_API_KEY`, flags Research; modo en que PM2 carga cambios de entorno. No enviar secretos ni `.env`.
5. Si hay archivos persistentes adicionales dentro del checkout, backups existentes y politica de restauracion.

Por ello **no se puede producir un respaldo verificable de produccion ni ensayar sus migraciones aun**. El respaldo local de 4.2 no reemplaza la base del VPS. No hay estimacion responsable de downtime hasta inspeccionar tamano/lock de SQLite, script y PM2.

## 4. Procedimiento propuesto, despues de obtener acceso de lectura

**Auditoria sin cambio:** en el VPS, leer `pwd`, `git rev-parse HEAD`, `git status --short`, `cat deploy.sh`, `node -v`, `npm -v`, `pm2 status`, `pm2 describe autolisty` con cuidado de no compartir secciones de entorno, y ruta real de `AUTOMATION_DB_PATH` sin exponer su contenido. Confirmar que la misma ruta se pasa al futuro systemd y a PM2. Leer solo el estado de Nginx y de la aplicacion. No hacer `git pull`, `npm install` ni `pm2 restart` en esta fase.

**Respaldo y ensayo, tras confirmar ruta y permisos:** usar la API de backup online de SQLite (`better-sqlite3.backup`) hacia una ruta fuera del checkout, no `cp` de un SQLite abierto en WAL. Registrar ruta, tamano, SHA-256, `PRAGMA integrity_check`, `user_version` y recuentos por tabla del original y del backup. Ensayar `runAutomationMigrations` solo sobre **otra copia** del backup; comparar `integrity_check`, recuentos y registros seleccionados de las tablas previas, y revisar espacio/tiempo. No abrir el original con `openAutomationDatabase` durante el ensayo porque migra automaticamente. Si cualquier discrepancia aparece, detenerse.

**Preparacion Git:** separar y revisar los archivos Research y el cambio necesario de `app/page.tsx`, migraciones y `package.json`; no incluir archivos ajenos ni bases/secretos. Crear commit(s), ejecutar de nuevo suite, TypeScript, lint acotado y build, comprobar diff y publicar a GitHub **solo tras autorizacion para esa accion**. El lint global hoy tiene 98 errores preexistentes; no ocultarlos bajo una etiqueta de exito.

**Despliegue futuro, sujeto a aprobacion posterior:** aplicar un `deploy.sh` revisado con parada en errores, backup pre-build/migracion, build verificado, migracion v10 controlada antes de servir rutas Research, PM2 con entorno actualizado, y systemd de mantenimiento con `AUTOMATION_DB_PATH` igual al de Autolisty. Mantener `MARKET_RESEARCH_LIVE_ENABLED=false`, `MARKET_RESEARCH_FULL_RUN_ENABLED=false`, `MARKET_RESEARCH_TRIAL_ENABLED=false` y EverBee/Kittl desactivados. El worker debe arrancar antes de permitir cualquier llamada Alura. Verificar `systemctl status` y `journalctl` sin secretos. La plantilla `deploy/systemd/autolisty-research-maintenance.service.example` requiere ajustar rutas/usuario y no debe instalarse tal cual sin verificarlos.

**Smoke tests:** inicio de sesion propietario; Listing y Scale manuales sin publicar ni llamar APIs facturables; Automation health/lectura; Research UI, investigaciones y evidencia manual, Create Prompts solo con proveedor simulado o sin llamadas facturables; worker heartbeat, version v10, `integrity_check` y PM2/Nginx sin 502. No probar publicacion Etsy, Pinterest ni investigaciones reales como parte del smoke.

## 5. Recuperacion prevista

Conservar commit anterior, backup online y hash. Ante fallo: bloquear trafico/worker Research, detener procesos que escriban SQLite, restaurar el backup **solo mediante procedimiento acordado** despues de tomar una copia forense del estado fallido, verificar hash e integridad, volver al commit anterior y reconstruir, reiniciar PM2 y validar Listing/Scale/Automation. Un rollback de codigo **no revierte** migraciones v10 por si solo; la aplicacion antigua puede no tolerar un esquema nuevo. Restaurar el backup implica perder escrituras posteriores, por lo que hay que medir la ventana y obtener autorizacion. No usar `git reset --hard` ni borrar archivos persistentes.

## 6. Punto de autorizacion

Antes de continuar necesito datos actuales de solo lectura del VPS o una via SSH autorizada para obtenerlos. Despues de la auditoria y del ensayo con la base real se presentara una propuesta definitiva con tiempo de interrupcion, comandos exactos y rollback validado. **No autorizar todavia migracion productiva, instalacion systemd, cambios de `.env`, reinicios, publicacion de GitHub o despliegue.**

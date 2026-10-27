# Etapa 5.3 - Company legado y despliegue definitivo

**No ejecutado:** este documento prepara el cambio. No hubo push, acceso al VPS, backup productivo, reinicio, instalacion ni borrado. Base de la rama: `0b24946`.

## Veredictos con evidencia

| Componente | Veredicto | Evidencia y condicion |
| --- | --- | --- |
| `/var/lib/autolisty/company.sqlite` | **Mantener hasta desplegar, respaldar y verificar; retirar despues** | En `66c827a:lib/company/db.ts`, `COMPANY_DB_PATH` abre la DB de Company (mensajes, tareas, Telegram, Kittl, voz). El VPS aun ejecuta `66c827a`, por tanto quitarla ahora rompe funciones activas. En `ed170d3` se eliminan `lib/company` y rutas `/api/company`; `git grep COMPANY_DB_PATH HEAD -- app lib scripts` no devuelve lectores. Listing, Scale, Automation y Research usan otras rutas/almacenes. La columna `automation_jobs.company_listing_id` queda solo por compatibilidad de esquema, no referencia `company.sqlite`. **No se ha inspeccionado el contenido de la DB real**, que puede contener historial valioso; conservar backup verificable antes de cualquier retirada. |
| PM2 `autolisty-kittl` | **Mantener hasta verificar su comando real y desplegar; retirar en la misma ventana despues de smoke** | `66c827a:scripts/company-worker-deploy.mjs` registra `scripts/company-kittl-worker.mjs` bajo ese nombre. El worker llama solo `/api/company/telegram/drain` y `/api/company/kittl/drain`, ambas eliminadas en `ed170d3`. El codigo actual no tiene consumidor de ese proceso ni integracion Kittl activa. El PM2 real podria haberse alterado manualmente; confirmar `pm_exec_path` y `pm_cwd` sin volcar su entorno antes de `pm2 delete`. Retirarlo **no elimina una futura integracion Kittl**: esta necesitara su propio diseno/autorizacion. |

En `0b24946`, `npm run build` ya no ejecuta `scripts/retire-legacy-processes.mjs`; la retirada sera manual y controlada. Ese script es codigo muerto sin hook, pero se deja sin borrar por la prohibicion de eliminar archivos en esta etapa. `COMPANY_DB_PATH` debe eliminarse de `.env.local` solo despues del cambio y de verificar que no queda consumidor; conservar copia privada de ese archivo para recuperacion. No tocar ahora `AUTH_SECRET`, credenciales Kittl o Telegram: la auditoria integral posterior revisara secretos y permisos sin mezclarla con este despliegue.

## Cambios reversibles y definitivos

- Reversibles: commit Git, archivo de configuracion respaldado, DB Automation nueva, instalacion systemd, `pm2 delete autolisty-kittl` si se conserva el dump previo y el codigo viejo para recuperacion, cuarentena de `company.sqlite`.
- Definitivos: borrar `company.sqlite` o su respaldo, destruir datos de Company, borrar secretos sin copia o perder el dump PM2 anterior. **No hacer esto durante el despliegue inicial.** Solicitar autorizacion aparte tras verificar recuperacion.
- El backup de Company puede contener mensajes y tokens cifrados: guardarlo fuera del checkout, modo 0600, no subirlo a Git ni compartir su contenido.

## Secuencia exacta propuesta, sujeta a autorizacion

### 0. Antes de publicar

Confirmar el contenido vigente de `/home/deploy/autolisty/deploy.sh` (solo falta ese archivo, no repetir auditoria general) y el comando real de PM2 sin exponer entorno. Este comando muestra unicamente ruta, cwd y estado:

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{for(const p of JSON.parse(s))if(p.name==="autolisty-kittl")console.log(JSON.stringify({name:p.name,path:p.pm2_env?.pm_exec_path,cwd:p.pm2_env?.pm_cwd,status:p.pm2_env?.status}))})'
```

Si la ruta no es `/home/deploy/autolisty/scripts/company-kittl-worker.mjs`, detener la limpieza y revisar ese proceso. Confirmar asimismo que no existe otra base Automation activa. La ausencia de `AUTOMATION_DB_PATH` en archivos examinados/PM2 y de `data/` en el checkout **no prueba** por si sola que no haya una base en otra ruta. No crear una segunda base si se descubre una primera.

### 1. Publicacion Git, solo tras autorizacion

En el PC, integrar la rama `codex/market-research-deploy-prep` en `main` con fast-forward, verificar pruebas y hacer push de `main`. El VPS usa `main`; subir solo la rama de trabajo no actualiza el despliegue. El commit servidor `66c827a` es ancestro del GitHub actual `ed170d3`; el cambio intermedio retira Company y James. Conservar ambos hashes para rollback.

### 2. Preflight y respaldo en el VPS

```bash
cd /home/deploy/autolisty
git status --short
git rev-parse HEAD
test ! -e /var/lib/autolisty/automation.sqlite
git fetch origin main
git merge --ff-only origin/main
npm ci
umask 077
mkdir -p /var/lib/autolisty/backups
node scripts/backup-sqlite.mjs /var/lib/autolisty/company.sqlite /var/lib/autolisty/backups/company-pre-research.sqlite
```

Si cualquiera falla, detenerse. `git status --short` debe revisarse para no sobreescribir cambios del VPS. El respaldo usa la API online de SQLite, incluye WAL y emite version, hash e integridad; registrar esos datos sin enviar el archivo. Si ya existe el destino del backup, elegir un nombre nuevo, nunca sobrescribirlo. El `git merge` solo trae codigo; el proceso PM2 viejo sigue vivo hasta el build/reinicio y su DB Company no se modifica.

### 3. Base Automation independiente y build

Agregar en el `.env.local` privado `AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite`, manteniendo `COMPANY_DB_PATH` de momento. Exportar esa misma ruta en la sesion que invoca PM2. Mantener `MARKET_RESEARCH_LIVE_ENABLED=false`, `MARKET_RESEARCH_FULL_RUN_ENABLED=false` y `MARKET_RESEARCH_TRIAL_ENABLED=false`. No activar EverBee/Kittl ni generar prompts durante el smoke.

```bash
export AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite
node --experimental-strip-types scripts/initialize-automation-db.mjs --create
bash deploy/deploy-market-research.sh.example
```

El inicializador falla si el archivo ya existe, usa migraciones v1-v10 e integridad. El candidato de deploy tiene `set -Eeuo pipefail`, `npm ci` y build antes de `pm2 restart autolisty --update-env`; no reinicia si falla el build. **No ejecutar el `deploy.sh` antiguo sin comparar su contenido y adaptar sus pasos vigentes.** `npm run build` escribe `.next` en el checkout vivo y puede causar indisponibilidad transitoria; no se promete cero downtime.

### 4. Mantenimiento y smoke

Con la DB v10 confirmada y la misma ruta en PM2 y systemd, instalar la plantilla `deploy/systemd/autolisty-research-maintenance.service.example` como `/etc/systemd/system/autolisty-research-maintenance.service` tras revisar usuario, Node y permisos. Entonces:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now autolisty-research-maintenance
sudo systemctl status autolisty-research-maintenance --no-pager
sudo journalctl -u autolisty-research-maintenance -n 50 --no-pager
pm2 status
curl -I https://autolisty.com/
```

Verificar login, Listing/Scale, salud y cola de Automation, UI e investigacion manual Research, Create Prompts **sin pulsar generar**, worker `COMPLETED`, esquema v10 e `integrity_check=ok`. No Etsy/Pinterest writes, no Alura, no OpenAI. Las rutas de diagnostico/trial Alura son deliberadamente solo locales: no probarlas en produccion.

### 5. Retirada controlada de Company

Solo despues del smoke y de confirmar la ruta PM2 del paso 0:

```bash
umask 077
cp -p "$HOME/.pm2/dump.pm2" /var/lib/autolisty/backups/pm2-pre-research.json
pm2 delete autolisty-kittl
pm2 save
pm2 status
```

La copia del dump puede contener secretos: mantener 0600 y no compartir. `pm2 save` impide que `autolisty-kittl` reaparezca por resurrect. Si `pm2 delete` falla o el proceso se recrea, parar y revisar startup/cron/systemd antes de mover la DB.

Con app nueva y worker legado ya detenido, hacer una segunda verificacion de integridad/backup Company, confirmar que no hay procesos con la DB abierta y poner el archivo en **cuarentena reversible** fuera de la ruta activa. No borrar el original ni sidecars sin comprobar estado WAL y backup. Eliminar `COMPANY_DB_PATH` de `.env.local` solo despues, guardando copia privada. La eliminacion definitiva de archivo y backup requiere una autorizacion posterior distinta.

## Recuperacion

Si falla antes de reiniciar PM2, no ejecutar limpieza. Si falla tras el reinicio, detener el servicio systemd Research, restaurar el checkout del commit previo en forma controlada, reconstruir y reiniciar `autolisty`; mantener la DB Automation nueva aislada, sin borrarla. Si Company vuelve a ser necesaria, restaurar `company.sqlite` desde backup verificado y el dump PM2 previo bajo aprobacion; no usar la base Automation como sustituta. No usar `git reset --hard`, no sobreescribir bases vivas y no asumir que un rollback de codigo revierte una migracion.

## Riesgos pendientes

No se ha visto `deploy.sh` actual ni `pm_exec_path` real; no se ha inspeccionado la DB Company productiva ni confirmado otra posible base Automation. La retirada de Company en `ed170d3` afecta funciones Company hoy activas hasta actualizar el VPS, aunque Listing/Scale/Automation no tienen dependencias de codigo. Las pruebas locales (85 pasan, TypeScript y build) no prueban el servidor. El servicio systemd y las rutas de persistencia requieren permisos efectivos en Hetzner. La auditoria integral posterior revisara el resto del proyecto por separado.

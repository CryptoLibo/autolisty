# Market Research Studio - Etapa 5.2: preparacion para GitHub y Hetzner

**Estado:** codigo preparado localmente; **NO ejecutar despliegue todavia**. Falta autorizacion de push/deploy y confirmar contenido actual de `/home/deploy/autolisty/deploy.sh` y ausencia de otra base Automation activa. No se modifico el VPS.

## Publicacion preparada

Rama local de preparacion: `codex/market-research-deploy-prep`. El commit y su hash se informan al terminar la preparacion. Incluye exclusivamente UI/rutas Research, bibliotecas Research, migraciones v4-v10 de la SQLite Automation, scripts de mantenimiento/respaldo/inicializacion, plantilla systemd, candidato de deploy, `app/page.tsx`, `package.json` y documentacion Research. Quedan fuera `.env*`, `data/`, `.tmp-test/`, `AGENTS.md`, `CLAUDE.md` y documentos ajenos.

La dependencia de Node 22.23.3 esta cubierta por Next 16 y por el uso de `node --experimental-strip-types` **solo** al inicializar manualmente la base con el modulo de migraciones TypeScript. La inicializacion se ha probado localmente con Node 25, no todavia en el Node 22 del VPS: validar `node --experimental-strip-types --help` y una copia temporal en el VPS antes de tocar la ruta final. Si esa compatibilidad falla, detenerse; no ejecutar migraciones por otro mecanismo improvisado.

`npm run build` ya no llama a `scripts/retire-legacy-processes.mjs`, por lo que no elimina `autolisty-kittl`. El proceso PM2 sigue vivo, aunque su funcionalidad heredada puede ser incompatible con la retirada de Company en `ed170d3`; comprobar sus logs sin reiniciarlo ni borrarlo.

## Variables y persistencia

Configurar tras autorizacion `AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite` en el entorno usado por Next/PM2 **y** con el mismo valor en systemd. No usar `/var/lib/autolisty/company.sqlite`: es otra base. No copiar la base local. Conservar `COMPANY_DB_PATH` y otras variables existentes hasta revisar consumidores; nunca incluir valores en Git o logs.

Mantener `MARKET_RESEARCH_LIVE_ENABLED=false`, `MARKET_RESEARCH_FULL_RUN_ENABLED=false`, `MARKET_RESEARCH_TRIAL_ENABLED=false`; no habilitar EverBee ni Kittl. `ALURA_API_KEY` puede quedar configurada pero ninguna consulta comercial se dispara con esas puertas cerradas. Create Prompts usa `OPENAI_API_KEY` solo por accion explicita del propietario y puede tener coste; no accionarlo durante el smoke.

`.gitignore` excluye `data/` y `.env*`, pero esto **no protege** una ruta persistente dentro del checkout si `deploy.sh` la borra. La ruta elegida `/var/lib/autolisty/automation.sqlite` esta fuera del checkout. El respaldo de `company.sqlite` debe hacerse online con `scripts/backup-sqlite.mjs`, no con copia simple de un SQLite abierto en WAL.

## Secuencia propuesta tras autorizacion, no ejecutada

**Preflight:** antes de cualquier cambio, pedir salida sin secretos de `cat /home/deploy/autolisty/deploy.sh`, `git status --short`, `pm2 status`, `test -e /var/lib/autolisty/automation.sqlite; echo $?`, y comprobar si alguna otra base Automation tiene trabajos. Si existe base activa o datos desconocidos, **parar**: no crear otra ni migrar hasta aclarar identidad y respaldo. Confirmar que el checkout permite fast-forward desde `66c827a` hasta el commit publicado y que hay rollback del commit anterior. Si `deploy.sh` es diferente al candidato, no sustituirlo sin fusionar sus pasos existentes.

**Respaldo previo:** desde `/home/deploy/autolisty`, tras traer el commit aprobado pero antes del build/reinicio, crear un directorio de backups fuera del checkout y usar:

```bash
node scripts/backup-sqlite.mjs /var/lib/autolisty/company.sqlite /var/lib/autolisty/backups/company-pre-research.sqlite
```

El comando falla si el destino existe, comprueba integridad y devuelve hash/tamano/version. Guardar ese hash y comprobar que el archivo es legible. Si existiera una base Automation previa, respaldarla de igual forma con un destino distinto y **ensayar migracion sobre otra copia**, nunca sobre el original; esto es una rama de trabajo distinta que requiere aprobacion especifica. No se dispone aun del backup ni del ensayo de produccion.

**Inicializacion de base nueva, solo si se confirma que no existe ninguna Automation activa:** añadir `AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite` al entorno privado de Autolisty y exportarlo en la sesion de despliegue. El directorio `/var/lib/autolisty` debe existir y ser escribible por `deploy`. Ejecutar una sola vez:

```bash
export AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite
node --experimental-strip-types scripts/initialize-automation-db.mjs --create
```

El script usa creacion exclusiva, se niega a sobrescribir cualquier archivo existente, migra incrementalmente hasta v10 y valida `integrity_check`. No toca `company.sqlite`. Si falla, detener el despliegue, conservar el archivo para diagnostico y no arrancar el worker.

**Build y app:** revisar `deploy.sh` real. El candidato `deploy/deploy-market-research.sh.example` usa `set -Eeuo pipefail`, verifica DB/branch/entorno, hace fast-forward, `npm ci`, `npm run build`, y solo entonces `pm2 restart autolisty --update-env` y `pm2 save`. Si build falla no reinicia PM2. No ejecutar el script historico si no ofrece esa garantia. El build actual modifica `.next` en el mismo checkout que usa el proceso vivo: puede haber indisponibilidad transitoria; para cero interrupcion haria falta un despliegue por releases separado, no validado aqui. La estimacion de downtime queda pendiente del `deploy.sh` real.

**Mantenimiento:** instalar solo tras verificar que la ruta de la unidad coincide con la ruta real y que la DB ya esta en v10. La plantilla esta en `deploy/systemd/autolisty-research-maintenance.service.example`; el servicio de produccion usara `/etc/systemd/system/autolisty-research-maintenance.service`. Tras aprobacion, `systemctl daemon-reload`, `systemctl enable --now autolisty-research-maintenance`, `systemctl status autolisty-research-maintenance` y `journalctl -u autolisty-research-maintenance -n 50 --no-pager`. No instalar en Windows. Si no queda sano, mantener bloqueadas las llamadas Alura.

## Verificacion y recuperacion

Smoke sin gasto: `pm2 status` debe mostrar `autolisty` y `autolisty-kittl` sin borrados; `curl -I https://autolisty.com/`; login del propietario; Listing y Scale cargan y mantienen datos; Automation health y cola leen la nueva DB sin trabajos ficticios; Research carga, permite investigacion manual y Create Prompts se ve sin generar; `systemctl status` y ultima bitacora del worker `COMPLETED`; `PRAGMA integrity_check` v10. No publicar Etsy/Pinterest ni consultar Alura.

Si falla antes del reinicio, detenerse; no hay rollback de PM2 necesario, pero el checkout/`.next` puede haber cambiado y debe restaurarse con un build del commit previo, sin `git reset --hard`. Si falla despues, detener worker, volver al commit previo en una rama/checkout controlado, reconstruir, reiniciar solo `autolisty`, validar Listing/Scale/Automation. Restaurar `company.sqlite` **solo si** hay evidencia de corrupcion y autorizacion explicita; no usar la base local. La base Automation nueva puede conservarse aislada; no borrarla automaticamente. Mantener el backup y hash para recuperacion.

## Verificaciones locales

Inicializacion desechable: v10, integridad `ok`; backup online desechable: v10, integridad `ok`, SHA-256 registrado. Suite: 85 pruebas pasan, 3 omitidas. TypeScript y lint de Research pasan. Build de produccion pasa. El lint global previo contiene errores ajenos al cambio y no se ha corregido en esta etapa.

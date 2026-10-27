# Market Research Studio - procedimiento definitivo propuesto

**Estado: pendiente de aprobacion.** No se hizo push, cambio de VPS, llamada comercial, instalacion, reinicio ni limpieza. El usuario confirmo: checkout `/home/deploy/autolisty`, servidor en `66c827a`, GitHub `main` en `ed170d3`, Node 22.23.3, PM2 `autolisty` y `autolisty-kittl`, y que este ultimo ejecuta `/home/deploy/autolisty/scripts/company-kittl-worker.mjs`. La unica SQLite hallada en las ubicaciones inspeccionadas es `/var/lib/autolisty/company.sqlite`; no se hallo `AUTOMATION_DB_PATH`. El `deploy.sh` vigente usa `git pull`, `npm install`, build, restart y save sin detenerse en errores: **no usarlo en este despliegue**.

El codigo de `ed170d3` retiro las rutas y dependencias de Company. `0b24946` agrega Research y quita el hook de build que borraba el worker; el nuevo procedimiento controla la retirada despues del smoke. `company.sqlite` nunca se usara como base de Automation. Las consultas comerciales siguen apagadas.

## A. Publicacion local, solo tras autorizacion

La rama local `codex/market-research-deploy-prep` contiene los commits de preparacion. Tras aprobar esta propuesta, fusionarla por fast-forward en `main`, repetir suite/TypeScript/build y hacer `git push origin main`. No subir `.env.local`, `data/`, temporales ni otros untracked. Guardar el hash publicado y confirmar que `git ls-remote origin refs/heads/main` coincide. El VPS debe pasar de `66c827a` a ese hash; el paso intermedio `ed170d3` retira Company.

## B. VPS: respaldo **antes de Git, npm o build**

Abrir una sesion SSH como `deploy`. Revisar que `git status --short` no muestre cambios tracked que puedan perderse. Ejecutar el bloque siguiente **antes de `git fetch/pull`**. Usa el `better-sqlite3` ya instalado por la version vigente y realiza backup online, consistente con WAL; no muestra filas ni secretos:

```bash
set -Eeuo pipefail
cd /home/deploy/autolisty
test "$(git rev-parse --short HEAD)" = 66c827a
git status --short
test -z "$(git status --porcelain --untracked-files=no)"
test -f .env.local
test -f /var/lib/autolisty/company.sqlite
test ! -e /var/lib/autolisty/automation.sqlite
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 700 -o deploy -g "$(id -gn)" /var/lib/autolisty/backups
export COMPANY_BACKUP_PATH="/var/lib/autolisty/backups/company-$STAMP.sqlite"
node - <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
(async () => {
  const source = "/var/lib/autolisty/company.sqlite";
  const output = process.env.COMPANY_BACKUP_PATH;
  if (!output || fs.existsSync(output)) throw Error("Backup path missing or already exists");
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw Error("Source integrity failed");
    await db.backup(output);
  } finally { db.close(); }
  const copy = new Database(output, { readonly: true, fileMustExist: true });
  try {
    if (copy.pragma("integrity_check", { simple: true }) !== "ok") throw Error("Backup integrity failed");
    const digest = crypto.createHash("sha256");
    for await (const chunk of fs.createReadStream(output)) digest.update(chunk);
    console.log(JSON.stringify({ file: output, bytes: fs.statSync(output).size,
      version: copy.pragma("user_version", { simple: true }), integrity: "ok",
      sha256: digest.digest("hex") }));
  } finally { copy.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE
test -s "$COMPANY_BACKUP_PATH"
cp -p .env.local "/var/lib/autolisty/backups/env-$STAMP"
chmod 600 "/var/lib/autolisty/backups/env-$STAMP"
test -f "$HOME/.pm2/dump.pm2" && cp -p "$HOME/.pm2/dump.pm2" "/var/lib/autolisty/backups/pm2-$STAMP.json"
```

**Parar aqui** si el backup no termina con `integrity=ok` y SHA-256, si hay cambios tracked desconocidos o si aparece una base Automation existente. El backup de `.env.local` y el dump PM2 pueden contener secretos: mantenerlos 0600 y no compartirlos. No usar el respaldo local de Windows.

## C. Git, entorno y base nueva

En la **misma sesion** (mantener `COMPANY_BACKUP_PATH` exportado), traer el commit aprobado y preparar dependencias. `git merge --ff-only` no sobrescribe cambios locales; si falla, parar:

```bash
git fetch origin main
git merge --ff-only origin/main
npm ci
node --version
command -v node
```

Comprobar Node 22.23.3 y que `command -v node` sea `/usr/bin/node` antes de instalar la unidad systemd de ejemplo. Editar el `.env.local` privado (sin compartir su contenido): añadir `AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite` y dejar `MARKET_RESEARCH_LIVE_ENABLED=false`, `MARKET_RESEARCH_FULL_RUN_ENABLED=false`, `MARKET_RESEARCH_TRIAL_ENABLED=false`. Mantener `COMPANY_DB_PATH` hasta pasar el smoke y la retirada. No configurar `EVERBEE_INSTALLATION_APPROVED=true`. La ruta de Automation debe existir solo como **destino**, no como base previa.

```bash
export AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite
test ! -e "$AUTOMATION_DB_PATH"
node --experimental-strip-types scripts/initialize-automation-db.mjs --create
node -e 'const D=require("better-sqlite3");const d=new D(process.env.AUTOMATION_DB_PATH,{readonly:true,fileMustExist:true});try{console.log({version:d.pragma("user_version",{simple:true}),integrity:d.pragma("integrity_check",{simple:true})})}finally{d.close()}'
```

El inicializador usa creacion exclusiva y migraciones v1-v10, y se niega a sobrescribir una DB. Confirmar `version: 10`, `integrity: ok`. No toca `company.sqlite`. Si falla, conservar el archivo para diagnostico y **no** arrancar Autolisty nuevo ni el worker.

## D. Build y reinicio controlado

No ejecutar el `./deploy.sh` viejo. Usar el candidato versionado, que exige backup Company integro, Automation v10, rama `main` y entorno; tiene `set -Eeuo pipefail`, `npm ci`, build, y **solo si ambos pasan** reinicia `autolisty` con `--update-env`:

```bash
bash deploy/deploy-market-research.sh.example
pm2 status
curl -I https://autolisty.com/
```

`npm run build` ya no ejecuta la retirada de `autolisty-kittl`; debe seguir online en este punto. Como el build usa el checkout vivo, puede haber una indisponibilidad breve o 502 transitorio; no se promete cero interrupcion. No se puede estimar una duracion exacta sin una medicion del build en el VPS.

## E. Mantenimiento y smoke sin gastos

La plantilla systemd ya apunta a `/var/lib/autolisty/automation.sqlite`, igual que PM2/Next. Confirmar usuario/ruta Node/permisos, y entonces:

```bash
sudo install -m 644 deploy/systemd/autolisty-research-maintenance.service.example /etc/systemd/system/autolisty-research-maintenance.service
sudo systemctl daemon-reload
sudo systemctl enable --now autolisty-research-maintenance.service
sudo systemctl status autolisty-research-maintenance.service --no-pager
sudo journalctl -u autolisty-research-maintenance.service -n 50 --no-pager
```

Debe registrar una pasada `COMPLETED`, sin errores, con la misma DB v10. Smoke: login GitHub propietario; Listing y Scale abren y muestran datos existentes; Automation health y cola cargan con base nueva vacia; Research UI carga, permite investigacion/evidencia manual y Create Prompts se muestra. **No** pulsar generar prompts, consultar Alura, Etsy Research, publicar Etsy/Pinterest ni activar flags de investigacion. Las rutas Alura de diagnostico y trial estan restringidas a local; no usar una investigacion completa para probar saldo.

## F. Retirada reversible despues del smoke

Con la version nueva comprobada, la ruta PM2 confirmada y Company ya sin rutas:

```bash
pm2 delete autolisty-kittl
pm2 save
pm2 status
sudo systemctl status autolisty-research-maintenance.service --no-pager
```

El dump PM2 previo se conservo en B; `pm2 save` evita resurrection automatica del worker viejo. Si reaparece, parar y revisar mecanismos externos antes de mover la DB.

Comprobar que nadie mantiene abierta `company.sqlite` ni sus sidecars. Si `fuser` no esta disponible o muestra procesos, **no moverla**. Tras verificar ausencia de usuarios, hacer checkpoint WAL y cuarentena, no eliminacion:

```bash
set -Eeuo pipefail
command -v fuser
if sudo fuser -s /var/lib/autolisty/company.sqlite; then
  echo "company.sqlite sigue en uso; detener cuarentena"
  exit 1
else
  rc=$?
  test "$rc" -eq 1 || exit 1
fi
node -e 'const D=require("better-sqlite3");const d=new D("/var/lib/autolisty/company.sqlite");try{const c=d.pragma("wal_checkpoint(TRUNCATE)");const i=d.pragma("integrity_check",{simple:true});if(c[0]?.busy!==0||i!=="ok")throw Error("Company checkpoint/integrity failed");console.log({checkpoint:c,integrity:i})}finally{d.close()}'
sudo install -d -m 700 -o deploy -g "$(id -gn)" /var/lib/autolisty/quarantine
mv -- /var/lib/autolisty/company.sqlite /var/lib/autolisty/quarantine/company.sqlite
test ! -e /var/lib/autolisty/company.sqlite-wal || mv -- /var/lib/autolisty/company.sqlite-wal /var/lib/autolisty/quarantine/company.sqlite-wal
test ! -e /var/lib/autolisty/company.sqlite-shm || mv -- /var/lib/autolisty/company.sqlite-shm /var/lib/autolisty/quarantine/company.sqlite-shm
```

**El bloque de cuarentena requiere juicio humano:** `fuser` debe devolver 1 (ningun proceso); cualquier otro resultado detiene el bloque. Comprobar visualmente que el checkpoint e integridad son correctos y que el backup B sigue legible antes de ejecutar las lineas de `mv`. Retirar `COMPANY_DB_PATH` de `.env.local` solo despues de la cuarentena, preservando la copia privada. No borrar el backup ni el contenido en cuarentena durante este despliegue.

## Recuperacion

- Antes de `pm2 restart`: no retirar el worker ni mover Company. Un build fallido no reinicia PM2, pero puede haber alterado `.next`; reconstruir desde el commit previo antes de seguir.
- Despues del reinicio, antes de cuarentena: detener/deshabilitar systemd Research; volver al commit servidor anterior `66c827a` mediante checkout controlado (sin `git reset --hard`), `npm ci`, build y reiniciar `autolisty`. La DB Company sigue en su lugar. El `postbuild` antiguo puede recrear/reiniciar el worker Company. Conservar la nueva Automation DB aislada; no borrarla.
- Despues de cuarentena: primero restaurar `company.sqlite` y sidecars desde cuarentena o backup verificado a su ruta original, restaurar `.env.local` y PM2 desde copias privadas bajo aprobacion, y solo entonces regresar al codigo anterior. No sobreescribir una DB activa ni perder escrituras posteriores.
- Ningun paso restaura automaticamente datos de otra DB; backup y rollback de codigo son operaciones separadas. El borrado definitivo de Company/respaldos queda para una autorizacion posterior.

## Punto de aprobacion

Publicacion de GitHub, respaldo productivo, configuracion `.env.local`, creacion de Automation DB, restart PM2, systemd, retirada del worker y cuarentena son cambios productivos y requieren aprobacion explicita. Esta propuesta se detiene aqui.

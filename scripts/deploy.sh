#!/usr/bin/env bash
# Despliegue de Autolisty en Hetzner. Lo llama ~/autolisty/deploy.sh.
# Se detiene al primer error: si algo falla, la versión que está corriendo
# no se reinicia y sigue sirviendo.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PM2_NAME="${PM2_NAME:-autolisty}"
BACKUP_DIR="${AUTOLISTY_BACKUP_DIR:-$HOME/autolisty-backups}"
BACKUPS_TO_KEEP="${AUTOLISTY_BACKUPS_TO_KEEP:-15}"
cd "$APP_DIR"

step() { printf '\n==> %s\n' "$1"; }

step "Versión"
echo "Commit: $(git rev-parse --short HEAD)  $(git log -1 --format=%s)"

step "Instalando dependencias exactas (npm ci)"
npm ci --no-audit --no-fund --loglevel=error

step "Compilando en una carpeta aparte (la web sigue sirviendo la versión actual)"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build
if [[ ! -f .next-build/BUILD_ID ]]; then
  echo "ERROR: la compilación no generó .next-build/BUILD_ID; no se cambia nada."
  exit 1
fi

step "Copia de seguridad de la base de Automation"
DB_PATH="${AUTOMATION_DB_PATH:-}"
if [[ -z "$DB_PATH" && -f .env.local ]]; then
  DB_PATH="$(grep -E '^AUTOMATION_DB_PATH=' .env.local | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [[ -n "$DB_PATH" && -f "$DB_PATH" ]]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/automation-$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).sqlite"
  node scripts/backup-sqlite.mjs "$DB_PATH" "$BACKUP_FILE"
  echo "Copia: $BACKUP_FILE"
  ls -1t "$BACKUP_DIR"/automation-*.sqlite 2>/dev/null | tail -n +"$((BACKUPS_TO_KEEP + 1))" | xargs -r rm -f
else
  echo "AVISO: no se encontró la base de Automation (AUTOMATION_DB_PATH); se omite la copia."
fi

APP_PORT="${APP_PORT:-}"
if [[ -z "$APP_PORT" && -f .env.local ]]; then
  APP_PORT="$(grep -E '^PORT=' .env.local | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [[ -z "$APP_PORT" ]]; then
  # El puerto con el que PM2 arranca la app (variable PORT o argumento -p/--port).
  APP_PORT="$(pm2 jlist 2>/dev/null | node -e '
    let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      try {
        const app = JSON.parse(raw).find((p) => p.name === process.argv[1]);
        const env = (app && app.pm2_env) || {};
        const args = [].concat(env.args || []).join(" ");
        const fromArgs = (args.match(/(?:-p|--port)[ =]?(\d+)/) || [])[1];
        process.stdout.write(String(env.PORT || (env.env && env.env.PORT) || fromArgs || ""));
      } catch { process.stdout.write(""); }
    });' "$PM2_NAME" || true)"
fi
APP_PORT="${APP_PORT:-3000}"

healthy() {
  # Una petición real a la app: /login debe responder 200.
  for _ in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/login" || true)"
    if [[ "$code" == "200" ]]; then return 0; fi
    sleep 3
  done
  return 1
}

step "Cambiando a la nueva versión"
rm -rf .next-previous
if [[ -d .next ]]; then mv .next .next-previous; fi
mv .next-build .next
pm2 restart "$PM2_NAME" --update-env

step "Comprobando que responde (http://127.0.0.1:${APP_PORT}/login)"
if healthy; then
  echo "La app responde."
  pm2 save
else
  echo "ERROR: la nueva versión no responde. Vuelvo a la anterior."
  if [[ -d .next-previous ]]; then
    rm -rf .next
    mv .next-previous .next
    pm2 restart "$PM2_NAME" --update-env
    if healthy; then echo "Versión anterior restaurada y respondiendo."; else echo "La versión anterior tampoco responde: pm2 logs $PM2_NAME --lines 80"; fi
  fi
  exit 1
fi

printf '\nDespliegue completado: %s\n' "$(git rev-parse --short HEAD)"

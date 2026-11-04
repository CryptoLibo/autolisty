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

step "Compilando"
npm run build

step "Copia de seguridad de la base de Automation"
DB_PATH="${AUTOMATION_DB_PATH:-}"
if [[ -z "$DB_PATH" && -f .env.local ]]; then
  DB_PATH="$(grep -E '^AUTOMATION_DB_PATH=' .env.local | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
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

step "Reiniciando PM2 ($PM2_NAME)"
pm2 restart "$PM2_NAME" --update-env
pm2 save

step "Comprobando que arrancó"
sleep 5
if pm2 jlist | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
    const app = JSON.parse(raw).find((p) => p.name === process.argv[1]);
    process.exit(app && app.pm2_env.status === "online" ? 0 : 1);
  });' "$PM2_NAME"; then
  echo "PM2: $PM2_NAME online"
else
  echo "ERROR: $PM2_NAME no está online. Revisa: pm2 logs $PM2_NAME --lines 50"
  exit 1
fi

printf '\nDespliegue completado: %s\n' "$(git rev-parse --short HEAD)"

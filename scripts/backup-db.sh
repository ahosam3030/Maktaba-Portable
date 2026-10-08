#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/backups"
TS="$(date +%Y%m%d_%H%M%S)"
DB="$ROOT/data/maktaba.db"
if [[ ! -f "$DB" ]]; then
  echo "Missing $DB — run the app once first"
  exit 1
fi
OUT="$ROOT/backups/maktaba_${TS}.db"
cp "$DB" "$OUT"
echo "Backup written: $OUT"

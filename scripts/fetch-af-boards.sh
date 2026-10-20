#!/usr/bin/env bash
# Daily EOD ingest of African exchange price boards from africanfinancials.com
# (NSE/NGX/GSE + DSE/USE/LUSE/BSE/MSE/SEM/VFEX/ZSE, added 2026-10-20).
# africanfinancials' WAF blocks datacenter IPs (Vercel, Supabase) but not
# this VM's curl, so: curl the pages here, parse locally, POST compact rows
# to the main Soko ingest hook (large HTML payloads don't survive the
# egress proxy), which upserts into public.stock_boards.
# Run once daily after African market close (~20:00 EAT).
set -euo pipefail

SECRET_FILE="$HOME/.config/soko-stock/cron-secret"
HOOK="https://sokoresult.vercel.app/api/public/hooks/ingest-boards"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

declare -A URLS=(
  [NSE]="https://africanfinancials.com/nairobi-securities-exchange-kenya-share-prices/"
  [NGX]="https://africanfinancials.com/nigerian-stock-exchange-share-prices/"
  [GSE]="https://africanfinancials.com/ghana-stock-exchange-share-prices/"
  [DSE]="https://africanfinancials.com/dar-es-salaam-stock-exchange-share-prices/"
  [USE]="https://africanfinancials.com/uganda-securities-exchange-share-prices/"
  [LUSE]="https://africanfinancials.com/lusaka-securities-exchange-share-prices/"
  [BSE]="https://africanfinancials.com/botswana-stock-exchange-share-prices/"
  [MSE]="https://africanfinancials.com/malawi-stock-exchange-share-prices/"
  [SEM]="https://africanfinancials.com/stock-exchange-of-mauritius-sem-share-prices/"
  [VFEX]="https://africanfinancials.com/victoria-falls-stock-exchange-share-prices/"
  [ZSE]="https://africanfinancials.com/zimbabwe-stock-exchange-share-prices/"
)

SECRET="$(cat "$SECRET_FILE")"
[ -n "$SECRET" ] || { echo "empty cron secret"; exit 1; }

for EX in NSE NGX GSE DSE USE LUSE BSE MSE SEM VFEX ZSE; do
  HTML="$TMPDIR_WORK/$EX.html"
  curl -sL --max-time 120 -A "$UA" -H "Accept: text/html" "${URLS[$EX]}" -o "$HTML"
  python3 "$SCRIPT_DIR/parse-af-boards.py" "$HTML" "$EX" > "$TMPDIR_WORK/$EX.json"
  RESP="$(curl -s -m 60 -X POST "$HOOK" \
    -H "Content-Type: application/json" -H "x-cron-secret: $SECRET" \
    -d "@$TMPDIR_WORK/$EX.json")"
  echo "$EX: $RESP"
done

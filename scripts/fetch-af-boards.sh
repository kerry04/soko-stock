#!/usr/bin/env bash
# Daily EOD board fetcher for NSE/NGX/GSE.
# africanfinancials.com blocks datacenter IPs (Vercel, Supabase get a
# Cloudflare challenge) but serves this VM's curl fine, so the fetch happens
# here and the raw HTML is POSTed to the soko-stock ingest hook, which
# parses and upserts into public.stock_boards.
#
# Secret lives in ~/.config/soko-stock/cron-secret (chmod 600), never in git.
set -euo pipefail

SECRET_FILE="$HOME/.config/soko-stock/cron-secret"
HOOK="https://soko-stock.vercel.app/api/public/hooks/ingest-boards"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

SECRET="$(cat "$SECRET_FILE")"

fetch_one() {
  local exchange="$1" url="$2"
  local tmp
  tmp="$(mktemp)"
  # -D - to capture headers would bloat; just check size + marker instead
  if ! curl -sL --max-time 90 -A "$UA" -H "Accept: text/html" "$url" -o "$tmp"; then
    echo "$exchange: curl failed" >&2
    rm -f "$tmp"
    return 1
  fi
  if ! grep -q "share-price" "$tmp" && ! grep -q "<table" "$tmp"; then
    echo "$exchange: unexpected page content ($(wc -c < "$tmp") bytes)" >&2
    rm -f "$tmp"
    return 1
  fi
  # POST the HTML as JSON {exchange, html}
  local resp
  resp="$(python3 - "$tmp" "$exchange" <<'EOF'
import json, sys
html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
print(json.dumps({"exchange": sys.argv[2], "html": html}))
EOF
)"
  rm -f "$tmp"
  local out
  out="$(curl -s --max-time 120 -X POST "$HOOK" \
    -H "Content-Type: application/json" \
    -H "x-cron-secret: $SECRET" \
    -d "$resp")"
  echo "$exchange: $out"
}

fetch_one NSE "https://africanfinancials.com/nairobi-securities-exchange-kenya-share-prices/"
fetch_one NGX "https://africanfinancials.com/nigerian-stock-exchange-share-prices/"
fetch_one GSE "https://africanfinancials.com/ghana-stock-exchange-share-prices/"

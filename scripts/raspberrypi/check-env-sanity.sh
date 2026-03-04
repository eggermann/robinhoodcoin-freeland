#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[error] missing env file: $ENV_FILE"
  exit 1
fi

echo "[info] scanning $ENV_FILE"

awk '
  BEGIN { bad=0 }
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  {
    line=$0
    if (line !~ /^[A-Za-z_][A-Za-z0-9_]*=.*/ ) {
      printf("[warn] malformed env line %d: %s\n", NR, line)
      bad=1
    }
  }
  END {
    if (bad==0) {
      print "[ok] no malformed env assignments found"
    }
  }
' "$ENV_FILE"

required=(
  TELEGRAM_BOT_TOKEN
  OPENCLAW_GATEWAY_TOKEN
  OPENCLAW_AGENT_ID
  OPENCLAW_MODEL
)

for key in "${required[@]}"; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  if [[ -z "$value" ]]; then
    echo "[warn] $key is empty or missing"
  fi
done

echo "[done] env sanity check complete"

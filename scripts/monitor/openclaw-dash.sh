#!/usr/bin/env bash
#
# OpenClaw live log dashboard with colored, exhibition-friendly output.
# - Tails the main OpenClaw log and gateway err log.
# - Highlights land/stamp/governance lines.
# - Shows inter-line delta and lines-per-second for a quick sense of pace.
#
# Usage:
#   ./scripts/monitor/openclaw-dash.sh
# Optional env:
#   LOG_DAY=2026-03-05   # pick a specific day; default is today

set -euo pipefail

DAY="${LOG_DAY:-$(date +%F)}"
MAIN_LOG="/tmp/openclaw/openclaw-${DAY}.log"
ERR_LOG="$HOME/logs/openclaw-gateway.err.log"

if [[ ! -f "$MAIN_LOG" ]]; then
  echo "Main log not found: $MAIN_LOG" >&2
fi

printf "Watching: %s\n         %s\n" "$MAIN_LOG" "$ERR_LOG"
printf "Legend: \033[38;5;82m[LAND]\033[0m land/stamp/gov | \033[38;5;214mWARN\033[0m | \033[38;5;196mERR\033[0m\n\n"

tail -n0 -F -q "$MAIN_LOG" "$ERR_LOG" 2>/dev/null | \
python3 -u - <<'PY'
import sys, json, time, re
from datetime import datetime

COL = {
    "info": "\033[38;5;45m",
    "warn": "\033[38;5;214m",
    "err": "\033[38;5;196m",
    "land": "\033[38;5;82m",
    "ts": "\033[38;5;250m",
    "reset": "\033[0m",
}

LAND_RE = re.compile(r"\b(land|parcel|acre|stamp|proposal|shortlist|governance)\b", re.I)

def pick_message(obj):
    if isinstance(obj, dict):
        if "1" in obj and isinstance(obj["1"], str):
            return obj["1"]
        if "message" in obj and isinstance(obj["message"], str):
            return obj["message"]
        if "0" in obj and isinstance(obj["0"], str):
            return obj["0"]
    return None

prev = time.time()
for line in sys.stdin:
    now = time.time()
    delta = now - prev
    rate = 1 / delta if delta > 0 else 0
    prev = now
    line = line.strip()
    if not line:
        continue

    level = "info"
    msg = line
    ts = datetime.fromtimestamp(now).strftime("%H:%M:%S")
    subsystem = ""

    try:
        obj = json.loads(line)
        meta = obj.get("_meta", {})
        ts_meta = meta.get("date")
        if ts_meta:
            ts = ts_meta[11:19]  # HH:MM:SS from ISO
        level = meta.get("logLevelName", "INFO").lower()
        subsystem = meta.get("name") or meta.get("subsystem") or ""
        picked = pick_message(obj)
        if picked:
            msg = picked
    except Exception:
        pass

    is_land = bool(LAND_RE.search(msg))
    color = COL["land"] if is_land else COL.get(level, COL["info"])
    tag = "[LAND]" if is_land else ""
    print(f"{COL['ts']}{ts}{COL['reset']} | +{delta:0.3f}s | {rate:6.2f} l/s | {color}{level.upper():4}{COL['reset']} {subsystem} {tag} {msg}")
PY

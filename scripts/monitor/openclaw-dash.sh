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

mkdir -p "$(dirname "$MAIN_LOG")" "$(dirname "$ERR_LOG")"
touch "$MAIN_LOG" "$ERR_LOG"

printf "Watching: %s\n         %s\n" "$MAIN_LOG" "$ERR_LOG"
printf "Legend: \033[38;5;82m[LAND]\033[0m land/stamp/gov | \033[38;5;214mWARN\033[0m | \033[38;5;196mERR\033[0m\n\n"

MAIN_LOG="$MAIN_LOG" ERR_LOG="$ERR_LOG" python3 -u <<'PY'
import sys, json, time, re, select, subprocess, os, shutil, textwrap
from collections import deque
from datetime import datetime

MAIN_LOG = os.environ["MAIN_LOG"]
ERR_LOG = os.environ["ERR_LOG"]

IDLE_FLUSH_SEC = 5
IDLE_FRAMES = ["-", "\\", "|", "/"]
MAX_BUFFER = 400

COL = {
    "info": "\033[38;5;45m",
    "warn": "\033[38;5;214m",
    "err": "\033[38;5;196m",
    "land": "\033[38;5;82m",
    "ts": "\033[38;5;250m",
    "reset": "\033[0m",
}

LAND_RE = re.compile(r"\b(land|parcel|acre|stamp|proposal|shortlist|governance)\b", re.I)
KV_RE = re.compile(r'([A-Za-z][A-Za-z0-9._-]*)=("[^"]*"|[^"\s]+)')
idle_frame_idx = 0
entries = deque(maxlen=MAX_BUFFER)
status_text = "starting"
last_log_key = None

def pick_message(obj):
    if isinstance(obj, dict):
        if "1" in obj and isinstance(obj["1"], str):
            return obj["1"]
        if "message" in obj and isinstance(obj["message"], str):
            return obj["message"]
        if "0" in obj and isinstance(obj["0"], str):
            return obj["0"]
    return None

def normalize_msg(msg):
    return re.sub(r"\s+", " ", msg).strip()

def titleize(text):
    text = text.replace("/", " ").replace("-", " ").replace("_", " ").strip()
    return " ".join(part.capitalize() for part in text.split()) or "General"

def human_subsystem(subsystem):
    subsystem = (subsystem or "").strip()
    if not subsystem:
        return "OpenClaw"
    return titleize(subsystem)

def extract_pairs(msg):
    pairs = []
    for key, value in KV_RE.findall(msg):
        cleaned = value.strip('"')
        pairs.append(f"{titleize(key)} {cleaned}")
    return pairs

def human_message(msg, subsystem):
    text = normalize_msg(msg)
    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
            bits = []
            for key, value in obj.items():
                if key == "subsystem":
                    continue
                bits.append(f"{titleize(str(key))}: {value}")
            return " | ".join(bits) if bits else human_subsystem(subsystem)
        except Exception:
            pass
    pairs = extract_pairs(text)
    for key, label in (
        ("embedded run timeout", "Agent request timed out"),
        ("request timed out before a response was generated", "Request timed out before completion"),
        ("request was aborted", "Request was aborted"),
        ("signal sigterm received", "Gateway received shutdown signal"),
        ("received sigterm; shutting down", "Gateway is shutting down"),
        ("shutdown timed out; exiting without full cleanup", "Shutdown exceeded cleanup window"),
        ("canvas host mounted", "Canvas view mounted"),
        ("listening on ws://", "Gateway socket listening"),
        ("log file:", "Writing log file"),
        ("bonjour: advertised gateway", "Network announcement active"),
        ("config hot reload applied", "Config reload applied"),
        ("config change detected; evaluating reload", "Config change detected"),
        ("lane wait exceeded", "Queue delay exceeded"),
        ("started (interval:", "Health monitor started"),
        ("gmail watcher stopped", "Gmail watcher stopped"),
    ):
        if key in text.lower():
            if pairs:
                return f"{label} | " + " | ".join(pairs)
            return label
    if pairs:
        return " | ".join(pairs)
    return text

def icon_for(level, subsystem, is_land):
    if is_land:
        return "LAND"
    if level == "err":
        return "ERR"
    if level == "warn":
        return "WARN"
    subsystem = (subsystem or "").lower()
    if "heartbeat" in subsystem:
        return "HEART"
    if "canvas" in subsystem:
        return "MAP"
    if "health" in subsystem:
        return "CHECK"
    if "embedded" in subsystem or "agent" in subsystem:
        return "AI"
    if "gateway" in subsystem:
        return "GATE"
    return "INFO"

def trim(text, width):
    if width <= 0:
        return ""
    plain = normalize_msg(text)
    return plain[:width]

def wrap_message(text, width):
    text = normalize_msg(text)
    if width <= 8:
        return [text]
    wrapped = textwrap.wrap(
        text,
        width=width,
        replace_whitespace=False,
        drop_whitespace=False,
        break_long_words=False,
        break_on_hyphens=False,
    )
    return wrapped or [text]

def format_entry(entry, width):
    color = COL["land"] if entry["is_land"] else COL.get(entry["level"], COL["info"])
    icon = icon_for(entry["level"], entry["subsystem"], entry["is_land"])
    repeat_tag = f" x{entry['repeat']}" if entry["repeat"] > 1 else ""
    prefix = (
        f"{COL['ts']}{entry['ts']}{COL['reset']} | +{entry['delta']:0.3f}s | "
        f"{entry['rate']:6.2f} l/s | {color}{icon:5}{COL['reset']} "
        f"{human_subsystem(entry['subsystem'])} | "
    )
    visible_prefix = len(re.sub(r"\x1b\[[0-9;]*m", "", prefix))
    available = max(width - visible_prefix, 12)
    wrapped = wrap_message(human_message(entry["msg"], entry["subsystem"]) + repeat_tag, available)
    indent = " " * visible_prefix
    lines = [prefix + wrapped[0]]
    for chunk in wrapped[1:]:
        lines.append(indent + chunk)
    return lines

def render():
    cols, rows = shutil.get_terminal_size((160, 40))
    log_rows = max(rows - 5, 3)
    rendered_entries = [format_entry(entry, cols) for entry in entries]
    visible_entries = []
    used_rows = 0
    for block in reversed(rendered_entries):
        block_rows = len(block)
        if visible_entries and used_rows + block_rows > log_rows:
            break
        if not visible_entries and block_rows > log_rows:
            visible_entries = block[-log_rows:]
            used_rows = len(visible_entries)
            break
        visible_entries = block + visible_entries
        used_rows += block_rows

    out = [
        "\033[?25l",
        "\033[H\033[2J",
        f"Watching: {MAIN_LOG}",
        f"         {ERR_LOG}",
        "Legend: LAND scouting | WARN alerts | ERR failures | AI agent | GATE gateway | MAP canvas",
        "",
    ]
    for line in visible_entries:
        out.append(line)
    while len(out) < rows:
        out.append("")
    out[-1] = trim(status_text, cols)
    sys.stdout.write("\n".join(out) + "\033[H")
    sys.stdout.flush()

def emit(msg, level, subsystem, ts, delta, rate, is_land):
    global last_log_key
    key = (level, subsystem, is_land, normalize_msg(msg))
    if key == last_log_key:
        entries[-1]["repeat"] += 1
        entries[-1]["ts"] = ts
        entries[-1]["delta"] = delta
        entries[-1]["rate"] = rate
    else:
        last_log_key = key
        entries.append({
            "msg": msg,
            "level": level,
            "subsystem": subsystem,
            "ts": ts,
            "delta": delta,
            "rate": rate,
            "is_land": is_land,
            "repeat": 1,
        })
    render()

def emit_idle(ts, delta):
    global idle_frame_idx, status_text
    frame = IDLE_FRAMES[idle_frame_idx % len(IDLE_FRAMES)]
    idle_frame_idx += 1
    status_text = (
        f"{COL['ts']}{ts}{COL['reset']} | +{delta:0.3f}s | "
        f"{0:6.2f} l/s | {COL['info']}HEART{COL['reset']} {frame} idle"
    )
    render()

tail = subprocess.Popen([
    "tail", "-n0", "-F", "-q", MAIN_LOG, ERR_LOG
], stdout=subprocess.PIPE, text=True, bufsize=1)

last_line_at = time.time()
status_text = f"{COL['info']}HEART{COL['reset']} booting"
render()

try:
    while True:
        ready, _, _ = select.select([tail.stdout], [], [], IDLE_FLUSH_SEC)
        now = time.time()

        if ready:
            line = tail.stdout.readline()
            if line == "":
                # Tail might have restarted; brief nap prevents tight spin
                time.sleep(0.05)
                continue
            line = line.strip()
            if not line:
                continue

            delta = now - last_line_at
            rate = 1 / delta if delta > 0 else 0
            last_line_at = now

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
            emit(msg, level, subsystem, ts, delta, rate, is_land)
        else:
            delta = now - last_line_at
            emit_idle(datetime.fromtimestamp(now).strftime("%H:%M:%S"), delta)
finally:
    try:
        sys.stdout.write("\033[?25h\n")
        sys.stdout.flush()
        tail.terminate()
    except Exception:
        pass
PY

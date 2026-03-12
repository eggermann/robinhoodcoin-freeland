#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install a user-level systemd timer that caps OpenClaw browser tabs on Raspberry Pi
and closes stale browser windows automatically.

Usage:
  bash scripts/raspberrypi/install-openclaw-browser-watchdog.sh

Options:
  --max-tabs N             Maximum tabs to keep open (default: 2)
  --max-age-seconds N      Close tabs older than this (default: 900)
  --idle-stop-seconds N    Stop browser when only blank tabs remain this long (default: 300)
  --interval-seconds N     Timer cadence in seconds (default: 60)
  -h, --help               Show this help
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
CONFIG_DIR="${HOME}/.config/openclaw-browser-watchdog"
ENV_FILE="${CONFIG_DIR}/env"
SERVICE_FILE="${UNIT_DIR}/openclaw-browser-watchdog.service"
TIMER_FILE="${UNIT_DIR}/openclaw-browser-watchdog.timer"

max_tabs=2
max_age_seconds=900
idle_stop_seconds=300
interval_seconds=60

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-tabs)
      max_tabs="${2:?missing value for --max-tabs}"
      shift 2
      ;;
    --max-age-seconds)
      max_age_seconds="${2:?missing value for --max-age-seconds}"
      shift 2
      ;;
    --idle-stop-seconds)
      idle_stop_seconds="${2:?missing value for --idle-stop-seconds}"
      shift 2
      ;;
    --interval-seconds)
      interval_seconds="${2:?missing value for --interval-seconds}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "${UNIT_DIR}" "${CONFIG_DIR}"

cat > "${ENV_FILE}" <<EOF
OPENCLAW_BROWSER_MAX_TABS=${max_tabs}
OPENCLAW_BROWSER_MAX_AGE_SECONDS=${max_age_seconds}
OPENCLAW_BROWSER_IDLE_STOP_SECONDS=${idle_stop_seconds}
OPENCLAW_BROWSER_URL=http://127.0.0.1:18791
OPENCLAW_BROWSER_WATCHDOG_STATE=${HOME}/.openclaw/browser-watchdog-state.json
OPENCLAW_CONFIG=${HOME}/.openclaw/openclaw.json
EOF

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=OpenClaw browser watchdog
After=openclaw-gateway.service

[Service]
Type=oneshot
EnvironmentFile=%h/.config/openclaw-browser-watchdog/env
WorkingDirectory=${REPO_ROOT}
ExecStart=/usr/bin/env python3 ${REPO_ROOT}/scripts/raspberrypi/openclaw-browser-watchdog.py
Nice=10
EOF

cat > "${TIMER_FILE}" <<EOF
[Unit]
Description=Run the OpenClaw browser watchdog periodically

[Timer]
OnBootSec=2min
OnUnitActiveSec=${interval_seconds}s
RandomizedDelaySec=10s
Persistent=true
Unit=openclaw-browser-watchdog.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now openclaw-browser-watchdog.timer
systemctl --user start openclaw-browser-watchdog.service

echo "Installed ${SERVICE_FILE}"
echo "Installed ${TIMER_FILE}"
echo "Config: ${ENV_FILE}"
echo
echo "Status:"
systemctl --user --no-pager --full status openclaw-browser-watchdog.timer || true
echo
echo "Logs:"
echo "  journalctl --user -u openclaw-browser-watchdog.service -n 50 --no-pager"

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Restart OpenClaw services on Raspberry Pi.

Usage:
  bash scripts/raspberrypi/restart-openclaw.sh
  bash scripts/raspberrypi/restart-openclaw.sh --gateway-only

Options:
  --gateway-only   Restart only openclaw-gateway
  --skip-env-sync  Do not sync repo .env into ~/.openclaw/.env before restart
  -h, --help       Show this help
EOF
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

restart_tunnel=true
sync_env=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway-only)
      restart_tunnel=false
      shift
      ;;
    --skip-env-sync)
      sync_env=false
      shift
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

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is not available on this machine." >&2
  exit 1
fi

service_installed() {
  local service="$1"
  local load_state
  load_state="$(systemctl --user show -p LoadState --value "${service}.service" 2>/dev/null || true)"
  [[ "${load_state}" != "not-found" && -n "${load_state}" ]]
}

restart_and_check() {
  local service="$1"

  if ! service_installed "${service}"; then
    echo "Skipping ${service}.service (not installed)."
    return 0
  fi

  echo "Restarting ${service}.service ..."
  systemctl --user restart "${service}.service"

  local active_state
  active_state="$(systemctl --user is-active "${service}.service" 2>/dev/null || true)"
  echo "  ${service}.service state: ${active_state:-unknown}"

  if [[ "${active_state}" != "active" ]]; then
    echo "  Check status: systemctl --user status ${service}.service --no-pager" >&2
    return 1
  fi
}

if [[ "${sync_env}" == "true" ]]; then
  if [[ -x "${SCRIPT_DIR}/sync-openclaw-env.sh" ]]; then
    echo "Syncing OpenClaw env..."
    bash "${SCRIPT_DIR}/sync-openclaw-env.sh"
  else
    echo "Skipping env sync (missing ${SCRIPT_DIR}/sync-openclaw-env.sh)."
  fi
fi

restart_and_check "openclaw-gateway"
if [[ "${restart_tunnel}" == "true" ]]; then
  restart_and_check "openclaw-tunnel"
fi

echo
echo "Done."
echo "Logs:"
echo "  journalctl --user -u openclaw-gateway -f -n 100"

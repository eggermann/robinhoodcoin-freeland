#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install a Raspberry Pi desktop autostart entry that opens the OpenClaw dashboard
in a fullscreen terminal after login.

Usage:
  bash scripts/raspberrypi/install-openclaw-dashboard-kiosk.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
AUTOSTART_DIR="${HOME}/.config/autostart"
BIN_DIR="${HOME}/.local/bin"
LAUNCHER="${BIN_DIR}/openclaw-dashboard-kiosk"
DESKTOP_FILE="${AUTOSTART_DIR}/openclaw-dashboard.desktop"

mkdir -p "${AUTOSTART_DIR}" "${BIN_DIR}"

cat > "${LAUNCHER}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT}"
TITLE="OpenClaw Dashboard"
LOCK_FILE="\${XDG_RUNTIME_DIR:-/tmp}/openclaw-dashboard-kiosk.lock"

if ! command -v lxterminal >/dev/null 2>&1; then
  echo "lxterminal is required for the OpenClaw dashboard kiosk." >&2
  exit 1
fi

exec 9>"\${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

if command -v wmctrl >/dev/null 2>&1; then
  (
    for _ in \$(seq 1 20); do
      sleep 1
      wmctrl -r "\${TITLE}" -b add,above >/dev/null 2>&1 || true
      wmctrl -r "\${TITLE}" -b add,maximized_vert,maximized_horz >/dev/null 2>&1 && exit 0
    done
  ) &
elif command -v xdotool >/dev/null 2>&1; then
  (
    for _ in \$(seq 1 20); do
      sleep 1
      window_id="\$(xdotool search --name "\${TITLE}" 2>/dev/null | head -n 1 || true)"
      if [[ -n "\${window_id}" ]]; then
        xdotool windowactivate "\${window_id}" >/dev/null 2>&1 || true
        xdotool key --window "\${window_id}" F11 >/dev/null 2>&1 && exit 0
      fi
    done
  ) &
fi

exec lxterminal \\
  --title="\${TITLE}" \\
  --working-directory="\${REPO_ROOT}" \\
  --geometry=240x70 \\
  --command="/bin/bash -lc 'cd \"\${REPO_ROOT}\" && exec ./scripts/raspberrypi/openclaw-dashboard-session.sh'"
EOF

chmod +x "${LAUNCHER}"

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=OpenClaw Dashboard
Comment=Open the OpenClaw live log dashboard in a fullscreen terminal
Exec=${LAUNCHER}
Terminal=false
StartupNotify=false
X-GNOME-Autostart-enabled=true
EOF

echo "Installed launcher: ${LAUNCHER}"
echo "Installed autostart entry: ${DESKTOP_FILE}"
echo
echo "Next steps:"
echo "  1. Log out and back in on the Raspberry Pi desktop."
echo "  2. The dashboard terminal should open fullscreen after desktop login."
echo "  3. To remove it later: rm '${DESKTOP_FILE}' '${LAUNCHER}'"

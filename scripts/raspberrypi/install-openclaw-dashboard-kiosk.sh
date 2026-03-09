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
LXTERMINAL_DIR="${HOME}/.config/lxterminal"
LXTERMINAL_CONF="${LXTERMINAL_DIR}/lxterminal.conf"
LAUNCHER="${BIN_DIR}/openclaw-dashboard-kiosk"
DESKTOP_FILE="${AUTOSTART_DIR}/openclaw-dashboard.desktop"

mkdir -p "${AUTOSTART_DIR}" "${BIN_DIR}" "${LXTERMINAL_DIR}"

if [[ ! -f "${LXTERMINAL_CONF}" ]]; then
  cat > "${LXTERMINAL_CONF}" <<'EOF'
[general]
fontname=Monospace 12
hidescrollbar=true
hidemenubar=true
hideclosebutton=true
bgcolor=rgb(0,0,0)
fgcolor=rgb(170,170,170)
tabpos=top
geometry_columns=240
geometry_rows=70
EOF
else
  python3 - <<'PY' "${LXTERMINAL_CONF}"
import configparser
import sys

path = sys.argv[1]
cfg = configparser.ConfigParser()
cfg.read(path)
if "general" not in cfg:
    cfg["general"] = {}
general = cfg["general"]
general["fontname"] = general.get("fontname", "Monospace 12")
general["hidescrollbar"] = "true"
general["hidemenubar"] = "true"
general["hideclosebutton"] = "true"
general["geometry_columns"] = "240"
general["geometry_rows"] = "70"
with open(path, "w", encoding="utf-8") as f:
    cfg.write(f)
PY
fi

cat > "${LAUNCHER}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT}"
TITLE="OpenClaw Dashboard"
LOCK_FILE="\${XDG_RUNTIME_DIR:-/tmp}/openclaw-dashboard-kiosk.lock"
STRICT_KIOSK="\${STRICT_KIOSK:-1}"

exec 9>"\${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

if [[ "\${STRICT_KIOSK}" == "1" ]]; then
  pkill -x lxpanel-pi >/dev/null 2>&1 || true
fi

if command -v wmctrl >/dev/null 2>&1; then
  (
    for _ in \$(seq 1 20); do
      sleep 1
      wmctrl -a "\${TITLE}" >/dev/null 2>&1 || true
      wmctrl -r "\${TITLE}" -b add,above,fullscreen >/dev/null 2>&1 || true
      wmctrl -r "\${TITLE}" -e 0,0,0,-1,-1 >/dev/null 2>&1 && exit 0
    done
  ) &
elif command -v xdotool >/dev/null 2>&1; then
  (
    for _ in \$(seq 1 20); do
      sleep 1
      window_id="\$(xdotool search --name "\${TITLE}" 2>/dev/null | head -n 1 || true)"
      if [[ -n "\${window_id}" ]]; then
        xdotool windowactivate "\${window_id}" >/dev/null 2>&1 || true
        xdotool windowsize "\${window_id}" 100% 100% >/dev/null 2>&1 || true
        xdotool windowmove "\${window_id}" 0 0 >/dev/null 2>&1 || true
        xdotool key --window "\${window_id}" F11 >/dev/null 2>&1 && exit 0
      fi
    done
  ) &
fi

cd "\${REPO_ROOT}"
exec python3 ./scripts/monitor/openclaw-dash-gui.py
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

#!/usr/bin/env bash
set -euo pipefail

UBERSPACE_USER="${UBERSPACE_USER:-}"
UBERSPACE_HOST="${UBERSPACE_HOST:-}"
TUNNEL_PORT="${TUNNEL_PORT:-18789}"
LOCAL_PORT="${LOCAL_PORT:-18789}"
SERVICE_NAME="${SERVICE_NAME:-openclaw-tunnel}"

if [[ -z "${UBERSPACE_USER}" || -z "${UBERSPACE_HOST}" ]]; then
  cat >&2 <<'EOF'
Usage:
  UBERSPACE_USER=<user> UBERSPACE_HOST=<host> [TUNNEL_PORT=18789] [LOCAL_PORT=18789] \
    bash scripts/raspberrypi/install-openclaw-tunnel.sh

Example:
  UBERSPACE_USER=eggman3 UBERSPACE_HOST=lynx.uberspace.de \
    bash scripts/raspberrypi/install-openclaw-tunnel.sh
EOF
  exit 1
fi

SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/${SERVICE_NAME}.service"

mkdir -p "${SERVICE_DIR}"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Reverse SSH tunnel for OpenClaw (${TUNNEL_PORT} -> ${LOCAL_PORT})
After=network-online.target openclaw-gateway.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -NT -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new -R 127.0.0.1:${TUNNEL_PORT}:127.0.0.1:${LOCAL_PORT} ${UBERSPACE_USER}@${UBERSPACE_HOST}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE_NAME}"

echo "Installed ${SERVICE_FILE}"
echo
systemctl --user status "${SERVICE_NAME}" --no-pager || true
echo
echo "Logs:"
echo "  journalctl --user -u ${SERVICE_NAME} -f -n 200"

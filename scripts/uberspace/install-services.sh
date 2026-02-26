#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SERVICES_DIR="${HOME}/etc/services.d"
LOG_DIR="${HOME}/logs/robinhoodcoin"
AUTONOMY_AUTOSTART="${AUTONOMY_AUTOSTART:-false}"

mkdir -p "${SERVICES_DIR}" "${LOG_DIR}"

cat > "${SERVICES_DIR}/robinhoodcoin-bot.ini" <<EOF
[program:robinhoodcoin-bot]
command=/bin/bash -lc '${ROOT_DIR}/scripts/uberspace/run-bot.sh'
directory=${ROOT_DIR}
autostart=true
autorestart=true
startsecs=5
stopsignal=TERM
stopasgroup=true
killasgroup=true
stdout_logfile=${LOG_DIR}/bot.log
stderr_logfile=${LOG_DIR}/bot.err.log
EOF

cat > "${SERVICES_DIR}/robinhoodcoin-autonomy.ini" <<EOF
[program:robinhoodcoin-autonomy]
command=/bin/bash -lc '${ROOT_DIR}/scripts/uberspace/run-autonomy.sh'
directory=${ROOT_DIR}
autostart=${AUTONOMY_AUTOSTART}
autorestart=unexpected
startsecs=5
stopsignal=TERM
stopasgroup=true
killasgroup=true
stdout_logfile=${LOG_DIR}/autonomy.log
stderr_logfile=${LOG_DIR}/autonomy.err.log
EOF

echo "Installed supervisor service files:"
echo " - ${SERVICES_DIR}/robinhoodcoin-bot.ini"
echo " - ${SERVICES_DIR}/robinhoodcoin-autonomy.ini"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SERVICES_DIR="${HOME}/etc/services.d"
LOG_DIR="${HOME}/logs/robinhoodcoin"
AUTONOMY_AUTOSTART="${AUTONOMY_AUTOSTART:-false}"
if [[ -z "${AUTONOMY_SERVICE_ENABLED:-}" ]]; then
  if [[ -f "${SERVICES_DIR}/robinhoodcoin-autonomy.ini" ]]; then
    AUTONOMY_SERVICE_ENABLED="true"
  else
    AUTONOMY_SERVICE_ENABLED="false"
  fi
fi

mkdir -p "${SERVICES_DIR}" "${LOG_DIR}"

cat > "${SERVICES_DIR}/robinhoodcoin-bot.ini" <<EOF
[program:robinhoodcoin-bot]
command=${ROOT_DIR}/scripts/uberspace/run-bot.sh
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

cat > "${SERVICES_DIR}/robinhoodcoin-web-next.ini" <<EOF
[program:robinhoodcoin-web-next]
command=${ROOT_DIR}/scripts/uberspace/run-web-next.sh
directory=${ROOT_DIR}/apps/web-next
autostart=true
autorestart=true
startsecs=5
stopsignal=TERM
stopasgroup=true
killasgroup=true
stdout_logfile=${LOG_DIR}/web-next.log
stderr_logfile=${LOG_DIR}/web-next.err.log
environment=NODE_ENV="production",PORT="3200"
EOF

if [[ "${AUTONOMY_SERVICE_ENABLED}" == "true" ]]; then
  cat > "${SERVICES_DIR}/robinhoodcoin-autonomy.ini" <<EOF
[program:robinhoodcoin-autonomy]
command=${ROOT_DIR}/scripts/uberspace/run-autonomy.sh
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
else
  rm -f "${SERVICES_DIR}/robinhoodcoin-autonomy.ini"
fi

echo "Installed supervisor service files:"
echo " - ${SERVICES_DIR}/robinhoodcoin-bot.ini"
echo " - ${SERVICES_DIR}/robinhoodcoin-web-next.ini"
if [[ "${AUTONOMY_SERVICE_ENABLED}" == "true" ]]; then
  echo " - ${SERVICES_DIR}/robinhoodcoin-autonomy.ini"
else
  echo " - (skipped) robinhoodcoin-autonomy.ini"
fi

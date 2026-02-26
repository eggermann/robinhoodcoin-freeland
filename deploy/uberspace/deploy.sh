#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

WEB_SUBDIR="${WEB_SUBDIR:-robinhoodcoin}"
WEB_SUBDIR="${WEB_SUBDIR#/}"
WEB_SUBDIR="${WEB_SUBDIR%/}"

if [[ -n "${WEB_SUBDIR}" ]]; then
  WEB_ROOT="${HOME}/html/${WEB_SUBDIR}"
  SITE_URL="https://${USER}.uber.space/${WEB_SUBDIR}/"
else
  WEB_ROOT="${HOME}/html"
  SITE_URL="https://${USER}.uber.space/"
fi

export PATH="${HOME}/.local/bin:${PATH}"

cd "${ROOT_DIR}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install/select Node.js first (for Uberspace: uberspace tools version use node 22)." >&2
  exit 1
fi

echo "Installing dependencies..."
npm ci

echo "Building backend..."
npm run build

echo "Building website..."
npm run build:web

echo "Publishing website to ${WEB_ROOT}..."
mkdir -p "${WEB_ROOT}"
rsync -a --delete site/dist/ "${WEB_ROOT}/"

# Keep live dashboard JSON and reports writable by the bot/daemon.
mkdir -p "${ROOT_DIR}/site/public/data"
rm -rf "${WEB_ROOT}/data"
ln -s "${ROOT_DIR}/site/public/data" "${WEB_ROOT}/data"

echo "Installing/updating supervisor services..."
"${ROOT_DIR}/scripts/uberspace/install-services.sh"

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl reread
  supervisorctl update
  supervisorctl restart robinhoodcoin-bot || supervisorctl start robinhoodcoin-bot

  if [[ "${START_AUTONOMY:-false}" == "true" ]]; then
    supervisorctl restart robinhoodcoin-autonomy || supervisorctl start robinhoodcoin-autonomy
  fi
else
  echo "supervisorctl not found. Start services manually after supervisord is available."
fi

echo
echo "Deploy complete."
echo "Website: ${SITE_URL}"
echo "Bot logs: ${HOME}/logs/robinhoodcoin/bot.log"
echo "Autonomy logs: ${HOME}/logs/robinhoodcoin/autonomy.log"

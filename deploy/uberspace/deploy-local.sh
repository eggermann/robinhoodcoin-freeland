#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

UBERSPACE_USER="${UBERSPACE_USER:-}"
UBERSPACE_HOST="${UBERSPACE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
WEB_SUBDIR="${WEB_SUBDIR:-robinhoodcoin}"
START_AUTONOMY="${START_AUTONOMY:-false}"
SKIP_LOCAL_BUILD="${SKIP_LOCAL_BUILD:-false}"
SSH_PASSWORD="${SSH_PASSWORD:-${SSH_KEY:-}}"

if [[ -z "${UBERSPACE_USER}" || -z "${UBERSPACE_HOST}" ]]; then
  echo "Set UBERSPACE_USER and UBERSPACE_HOST (example: UBERSPACE_USER=eggman3 UBERSPACE_HOST=lynx.uberspace.de)." >&2
  exit 1
fi

if [[ -z "${REMOTE_DIR}" ]]; then
  REMOTE_DIR="/home/${UBERSPACE_USER}/robinhoodcoin-freeland"
fi

WEB_SUBDIR="${WEB_SUBDIR#/}"
WEB_SUBDIR="${WEB_SUBDIR%/}"
if [[ -n "${WEB_SUBDIR}" ]]; then
  WEB_ROOT="/home/${UBERSPACE_USER}/html/${WEB_SUBDIR}"
  SITE_URL="https://${UBERSPACE_USER}.uber.space/${WEB_SUBDIR}/"
else
  WEB_ROOT="/home/${UBERSPACE_USER}/html"
  SITE_URL="https://${UBERSPACE_USER}.uber.space/"
fi

REMOTE="${UBERSPACE_USER}@${UBERSPACE_HOST}"
SSH_CMD=(ssh)
RSYNC_SSH_CMD="ssh"

if [[ -n "${SSH_PASSWORD}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass not found, but SSH_PASSWORD/SSH_KEY was provided." >&2
    exit 1
  fi

  export SSHPASS="${SSH_PASSWORD}"
  SSH_CMD=(
    sshpass
    -e
    ssh
    -o
    PubkeyAuthentication=no
    -o
    PreferredAuthentications=password,keyboard-interactive
    -o
    NumberOfPasswordPrompts=1
  )
  RSYNC_SSH_CMD="sshpass -e ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive -o NumberOfPasswordPrompts=1"
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh not found." >&2
  exit 1
fi
if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync not found." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found on local machine." >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ "${SKIP_LOCAL_BUILD}" != "true" ]]; then
  echo "Installing local dependencies..."
  npm ci

  echo "Building backend locally..."
  npm run build

  echo "Building website locally..."
  npm run build:web
fi

echo "Preparing remote directories..."
"${SSH_CMD[@]}" "${REMOTE}" "mkdir -p '${REMOTE_DIR}' '${REMOTE_DIR}/scripts' '${REMOTE_DIR}/site/public/data' '${WEB_ROOT}' '/home/${UBERSPACE_USER}/logs/robinhoodcoin'"

echo "Syncing runtime artifacts to ${REMOTE}:${REMOTE_DIR}..."
rsync -az --delete -e "${RSYNC_SSH_CMD}" "${ROOT_DIR}/dist/" "${REMOTE}:${REMOTE_DIR}/dist/"
rsync -az -e "${RSYNC_SSH_CMD}" "${ROOT_DIR}/package.json" "${ROOT_DIR}/package-lock.json" "${REMOTE}:${REMOTE_DIR}/"
rsync -az --delete -e "${RSYNC_SSH_CMD}" "${ROOT_DIR}/scripts/uberspace/" "${REMOTE}:${REMOTE_DIR}/scripts/uberspace/"

echo "Publishing static website to ${REMOTE}:${WEB_ROOT}..."
rsync -az --delete -e "${RSYNC_SSH_CMD}" "${ROOT_DIR}/site/dist/" "${REMOTE}:${WEB_ROOT}/"

REMOTE_ENV="$(printf "REMOTE_DIR=%q WEB_ROOT=%q START_AUTONOMY=%q" "${REMOTE_DIR}" "${WEB_ROOT}" "${START_AUTONOMY}")"

echo "Running remote install + service reload..."
"${SSH_CMD[@]}" "${REMOTE}" "${REMOTE_ENV} bash -s" <<'EOF'
set -euo pipefail

cd "${REMOTE_DIR}"

npm install --omit=dev --no-audit --no-fund --no-progress

bash scripts/uberspace/install-services.sh

mkdir -p "${REMOTE_DIR}/site/public/data"
rm -rf "${WEB_ROOT}/data"
ln -s "${REMOTE_DIR}/site/public/data" "${WEB_ROOT}/data"

if command -v supervisorctl >/dev/null 2>&1; then
  supervisorctl reread
  supervisorctl update
  supervisorctl restart robinhoodcoin-bot || supervisorctl start robinhoodcoin-bot
  if [[ "${START_AUTONOMY}" == "true" ]]; then
    supervisorctl restart robinhoodcoin-autonomy || supervisorctl start robinhoodcoin-autonomy
  fi
else
  echo "supervisorctl not found. Start services manually."
fi
EOF

echo
echo "Local deploy complete."
echo "Target: ${REMOTE}"
echo "Remote app dir: ${REMOTE_DIR}"
echo "Website: ${SITE_URL}"
echo "Bot logs (remote): /home/${UBERSPACE_USER}/logs/robinhoodcoin/bot.log"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/web-next"

export PATH="${HOME}/.local/bin:${PATH}"

cd "${APP_DIR}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "${NODE_BIN}" ]]; then
  echo "node binary not found (PATH=${PATH})" >&2
  exit 1
fi

PORT="${PORT:-3200}"
DATABASE_URL="${WEB_NEXT_DATABASE_URL:-${DATABASE_URL:-file:./prisma/dev.db}}"

exec env DATABASE_URL="${DATABASE_URL}" PORT="${PORT}" "${NODE_BIN}" ./node_modules/next/dist/bin/next start -p "${PORT}"

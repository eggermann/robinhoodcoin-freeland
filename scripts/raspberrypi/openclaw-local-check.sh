#!/usr/bin/env bash
set -euo pipefail

# Local OpenClaw check helper for this repo.
# - Forces Node 22 from nvm if available
# - Avoids false security error from OPENCLAW_GATEWAY_URL in local loopback setups
# - Runs status + doctor consistently

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NVM_NODE="${HOME}/.nvm/versions/node/v22.22.0/bin"

if [[ -x "${NVM_NODE}/node" ]]; then
  export PATH="${NVM_NODE}:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[error] node not found on PATH"
  exit 1
fi

NODE_VERSION="$(node -v || true)"
echo "[info] node: ${NODE_VERSION}"

# Keep runtime credentials, but drop explicit gateway URL for CLI health checks.
unset OPENCLAW_GATEWAY_URL

cd /tmp

echo "[info] openclaw version"
npx -y openclaw --version

echo "[info] openclaw status"
npx -y openclaw status --deep || true

echo "[info] openclaw doctor"
npx -y openclaw doctor --non-interactive

echo "[ok] local check completed"

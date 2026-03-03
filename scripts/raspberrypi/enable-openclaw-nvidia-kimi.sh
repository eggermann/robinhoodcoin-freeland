#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Enable NVIDIA Kimi model in OpenClaw allowlist + provider config.

Usage:
  NVIDIA_API_KEY='nvapi-...' bash scripts/raspberrypi/enable-openclaw-nvidia-kimi.sh
  bash scripts/raspberrypi/enable-openclaw-nvidia-kimi.sh --set-primary

Options:
  --set-primary  Also switch OpenClaw primary model to nvidia/moonshotai/kimi-k2.5
  -h, --help     Show this help

Notes:
  - Updates: ~/.openclaw/openclaw.json
  - Optional key storage: ~/.openclaw/.env (NVIDIA_API_KEY)
  - Restarts openclaw-gateway.service when systemctl --user is available.
EOF
}

set_primary=false

case "${1:-}" in
  "")
    ;;
  --set-primary)
    set_primary=true
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown option: ${1}" >&2
    usage >&2
    exit 1
    ;;
esac

CONFIG_PATH="${HOME}/.openclaw/openclaw.json"
ENV_PATH="${HOME}/.openclaw/.env"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if [[ ! -d "${REPO_ROOT}/node_modules/json5" ]]; then
  echo "Missing dependency: ${REPO_ROOT}/node_modules/json5" >&2
  echo "Run: cd ${REPO_ROOT} && npm install" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "OpenClaw config not found: ${CONFIG_PATH}" >&2
  exit 1
fi

cp "${CONFIG_PATH}" "${CONFIG_PATH}.bak.${TIMESTAMP}"
echo "Backup created: ${CONFIG_PATH}.bak.${TIMESTAMP}"

NODE_PATH="${REPO_ROOT}/node_modules" node - "${CONFIG_PATH}" "${set_primary}" <<'NODE'
const fs = require("node:fs");

let JSON5;
try {
  JSON5 = require("json5");
} catch (err) {
  console.error(
    "Missing dependency: json5. Run `npm install` in the repo root.",
  );
  process.exit(1);
}

const configPath = process.argv[2];
const setPrimary = (process.argv[3] ?? "").toLowerCase() === "true";

const raw = fs.readFileSync(configPath, "utf-8");
const config = JSON5.parse(raw);

const agents = (config.agents ??= {});
const defaults = (agents.defaults ??= {});

const allowlist = (defaults.models ??= {});
const allowKey = "nvidia/moonshotai/kimi-k2.5";
const currentAllowEntry = allowlist[allowKey];
allowlist[allowKey] =
  typeof currentAllowEntry === "object" && currentAllowEntry !== null
    ? { ...currentAllowEntry, alias: "nvidia-kimi" }
    : { alias: "nvidia-kimi" };

if (setPrimary) {
  let modelBlock = defaults.model;
  if (typeof modelBlock === "string") {
    modelBlock = { primary: modelBlock };
    defaults.model = modelBlock;
  } else if (!modelBlock) {
    modelBlock = {};
    defaults.model = modelBlock;
  }

  if (typeof modelBlock !== "object" || Array.isArray(modelBlock)) {
    defaults.model = { primary: allowKey };
  } else {
    modelBlock.primary = allowKey;
  }
}

const models = (config.models ??= {});
if (!models.mode) models.mode = "merge";
const providers = (models.providers ??= {});

providers.nvidia = {
  baseUrl: "https://integrate.api.nvidia.com/v1",
  api: "openai-completions",
  // Resolve API key via env (`NVIDIA_API_KEY`) or auth profiles.
  models: [{ id: "moonshotai/kimi-k2.5", name: "NVIDIA Kimi K2.5" }],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
NODE

echo "Updated OpenClaw model allowlist/provider in ${CONFIG_PATH}"

if [[ -n "${NVIDIA_API_KEY:-}" ]]; then
  mkdir -p "$(dirname "${ENV_PATH}")"
  touch "${ENV_PATH}"
  if grep -q '^NVIDIA_API_KEY=' "${ENV_PATH}"; then
    sed -i "s/^NVIDIA_API_KEY=.*/NVIDIA_API_KEY=${NVIDIA_API_KEY//\//\\/}/" "${ENV_PATH}"
  else
    printf '\nNVIDIA_API_KEY=%s\n' "${NVIDIA_API_KEY}" >> "${ENV_PATH}"
  fi
  echo "Stored NVIDIA_API_KEY in ${ENV_PATH}"
else
  echo "NVIDIA_API_KEY not provided in shell. Skipped writing ${ENV_PATH}."
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl --user show -p LoadState --value openclaw-gateway.service >/dev/null 2>&1; then
    systemctl --user restart openclaw-gateway.service
    echo "Restarted openclaw-gateway.service"
  else
    echo "openclaw-gateway.service not installed under systemctl --user."
  fi
else
  echo "systemctl not found; restart OpenClaw gateway manually."
fi

echo
echo "Next checks:"
echo "  openclaw models list | grep -i kimi"
echo "  openclaw models set nvidia/moonshotai/kimi-k2.5"
echo "  /model nvidia-kimi"

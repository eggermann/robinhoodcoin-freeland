#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Enable OpenAI gpt-4.1-mini in OpenClaw (internal allowlist + optional fallback).

Usage:
  OPENAI_API_KEY='sk-...' bash scripts/raspberrypi/enable-openclaw-openai-gpt-4-1-mini.sh
  OPENAI_API_KEY='sk-...' bash scripts/raspberrypi/enable-openclaw-openai-gpt-4-1-mini.sh --add-fallback

Options:
  --add-fallback  Append openai/gpt-4.1-mini to agents.defaults.model.fallbacks (keeps primary unchanged)
  -h, --help      Show this help

Notes:
  - Updates: ~/.openclaw/openclaw.json (JSON5 supported; file is rewritten as JSON, backup created)
  - Optional key storage: ~/.openclaw/.env (OPENAI_API_KEY)
  - Restarts openclaw-gateway.service when systemctl --user is available (OpenClaw also hot-reloads config).
EOF
}

add_fallback=false

case "${1:-}" in
  "")
    ;;
  --add-fallback)
    add_fallback=true
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

NODE_PATH="${REPO_ROOT}/node_modules" node - "${CONFIG_PATH}" "${add_fallback}" <<'NODE'
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
const addFallback = (process.argv[3] ?? "").toLowerCase() === "true";

const raw = fs.readFileSync(configPath, "utf-8");
const config = JSON5.parse(raw);

const agents = (config.agents ??= {});
const defaults = (agents.defaults ??= {});

const allowlist = (defaults.models ??= {});
const modelKey = "openai/gpt-4.1-mini";
const currentAllowEntry = allowlist[modelKey];
allowlist[modelKey] =
  typeof currentAllowEntry === "object" && currentAllowEntry !== null
    ? { ...currentAllowEntry, alias: currentAllowEntry.alias ?? "gpt-4.1-mini" }
    : { alias: "gpt-4.1-mini" };

if (addFallback) {
  let modelBlock = defaults.model;
  if (typeof modelBlock === "string") {
    modelBlock = { primary: modelBlock };
    defaults.model = modelBlock;
  } else if (!modelBlock) {
    modelBlock = {};
    defaults.model = modelBlock;
  }

  if (typeof modelBlock !== "object" || Array.isArray(modelBlock)) {
    modelBlock = {};
    defaults.model = modelBlock;
  }

  const fallbacks = modelBlock.fallbacks;
  if (Array.isArray(fallbacks)) {
    if (!fallbacks.includes(modelKey)) fallbacks.push(modelKey);
  } else if (fallbacks == null) {
    modelBlock.fallbacks = [modelKey];
  } else {
    modelBlock.fallbacks = [modelKey];
  }
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
NODE

echo "Enabled openai/gpt-4.1-mini in OpenClaw allowlist: ${CONFIG_PATH}"

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  mkdir -p "$(dirname "${ENV_PATH}")"
  touch "${ENV_PATH}"
  if grep -q '^OPENAI_API_KEY=' "${ENV_PATH}"; then
    sed -i "s/^OPENAI_API_KEY=.*/OPENAI_API_KEY=${OPENAI_API_KEY//\//\\/}/" "${ENV_PATH}"
  else
    printf '\nOPENAI_API_KEY=%s\n' "${OPENAI_API_KEY}" >> "${ENV_PATH}"
  fi
  echo "Stored OPENAI_API_KEY in ${ENV_PATH}"
else
  echo "OPENAI_API_KEY not provided in shell. Skipped writing ${ENV_PATH}."
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
echo "  openclaw models list | grep -i 'gpt-4.1-mini'"
echo "  openclaw models status"
echo "  openclaw models set openai/gpt-4.1-mini  # only if you want it active"

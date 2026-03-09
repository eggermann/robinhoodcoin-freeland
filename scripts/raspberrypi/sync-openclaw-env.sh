#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Sync selected keys from the project .env into OpenClaw's systemd env file on the Pi.

Why:
  OpenClaw gateway runs under `systemd --user`, so it won't automatically read your repo `.env`.
  This script syncs keys (e.g. NVIDIA_API_KEY) into `~/.openclaw/.env` and ensures
  the gateway service loads it via a systemd drop-in.

Usage:
  bash scripts/raspberrypi/sync-openclaw-env.sh

Options:
  --source <path>   Source env file (default: <repo>/.env)
  --target <path>   Target env file (default: ~/.openclaw/.env)
  --keys <csv>      Keys to sync (default: NVIDIA_API_KEY,OPENAI_API_KEY,BRAVE_API_KEY)
  -h, --help        Show this help

Exit codes:
  0 success (even if no keys were updated)
  1 invalid usage / missing prerequisites
EOF
}

SOURCE_ENV=""
TARGET_ENV="${HOME}/.openclaw/.env"
KEYS_CSV="NVIDIA_API_KEY,OPENAI_API_KEY,BRAVE_API_KEY"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_ENV="${2:-}"
      shift 2
      ;;
    --target)
      TARGET_ENV="${2:-}"
      shift 2
      ;;
    --keys)
      KEYS_CSV="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if [[ -z "${SOURCE_ENV}" ]]; then
  SOURCE_ENV="${REPO_ROOT}/.env"
fi

if [[ ! -f "${SOURCE_ENV}" ]]; then
  echo "Source env file not found: ${SOURCE_ENV}" >&2
  echo "Tip: pass --source /path/to/.env" >&2
  exit 1
fi

mkdir -p "$(dirname "${TARGET_ENV}")"
touch "${TARGET_ENV}"
chmod 600 "${TARGET_ENV}" || true

trim_ws() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "${s}"
}

extract_env_value() {
  local file="$1"
  local key="$2"
  local line value

  # Take the last occurrence if duplicated.
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "${file}" | tail -n 1 || true)"
  [[ -z "${line}" ]] && return 1

  line="${line%$'\r'}"
  line="${line#export }"
  value="${line#*=}"
  value="$(trim_ws "${value}")"

  # Strip unquoted inline comments (e.g. KEY=value # comment).
  if [[ "${value}" != \"*\" && "${value}" != \'*\' ]]; then
    value="${value%% \#*}"
    value="$(trim_ws "${value}")"
  fi

  # Strip matching wrapping quotes.
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  [[ -z "${value}" ]] && return 1
  printf '%s' "${value}"
}

escape_sed_replacement() {
  # Escape replacement for sed using | delimiter.
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//|/\\|}"
  s="${s//&/\\&}"
  printf '%s' "${s}"
}

upsert_env_line() {
  local file="$1"
  local key="$2"
  local value="$3"
  local esc
  esc="$(escape_sed_replacement "${value}")"

  if grep -q -E "^[[:space:]]*${key}[[:space:]]*=" "${file}"; then
    sed -i "s|^[[:space:]]*${key}[[:space:]]*=.*|${key}=${esc}|" "${file}"
  else
    # Ensure newline between existing content and appended keys.
    if [[ -s "${file}" ]] && [[ -n "$(tail -n 1 "${file}" | tr -d '\r')" ]]; then
      printf '\n' >> "${file}"
    fi
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

IFS=',' read -r -a KEYS <<< "${KEYS_CSV}"

updated_any=false
for raw_key in "${KEYS[@]}"; do
  key="$(trim_ws "${raw_key}")"
  [[ -z "${key}" ]] && continue

  if value="$(extract_env_value "${SOURCE_ENV}" "${key}")"; then
    upsert_env_line "${TARGET_ENV}" "${key}" "${value}"
    updated_any=true
    echo "Synced ${key} -> ${TARGET_ENV}"
  else
    echo "Skipping ${key} (not set in ${SOURCE_ENV})"
  fi
done

chmod 600 "${TARGET_ENV}" || true

# Ensure gateway service loads ~/.openclaw/.env
DROPIN_DIR="${HOME}/.config/systemd/user/openclaw-gateway.service.d"
DROPIN_FILE="${DROPIN_DIR}/env.conf"
mkdir -p "${DROPIN_DIR}"

DESIRED_DROPIN_CONTENT=$(
  cat <<'EOF'
[Service]
EnvironmentFile=-%h/.openclaw/.env
EOF
)

dropin_changed=false
if [[ -f "${DROPIN_FILE}" ]]; then
  if ! diff -q <(printf '%s\n' "${DESIRED_DROPIN_CONTENT}") "${DROPIN_FILE}" >/dev/null 2>&1; then
    dropin_changed=true
  fi
else
  dropin_changed=true
fi

if [[ "${dropin_changed}" == "true" ]]; then
  printf '%s\n' "${DESIRED_DROPIN_CONTENT}" > "${DROPIN_FILE}"
  echo "Updated systemd drop-in: ${DROPIN_FILE}"

  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload || true
  fi
fi

if [[ "${updated_any}" == "false" ]]; then
  echo "No keys were updated."
fi

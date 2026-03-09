#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

clear
printf '\033]0;%s\007' "OpenClaw Dashboard"

echo "OpenClaw dashboard session"
echo "Repo: ${REPO_ROOT}"
echo

if command -v systemctl >/dev/null 2>&1; then
  until systemctl --user is-active --quiet openclaw-gateway.service; do
    printf '\rWaiting for openclaw-gateway.service to become active %s' "$(date '+%H:%M:%S')"
    sleep 2
  done
  printf '\r\033[2K'
fi

exec "${REPO_ROOT}/scripts/monitor/openclaw-dash.sh"

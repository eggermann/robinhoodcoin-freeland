# Pi + Uberspace Runbook (OpenClaw Gateway + Telegram Bot)

This runbook documents the working production setup:
- Raspberry Pi runs OpenClaw Gateway.
- Uberspace runs the Telegram bot and website.
- A reverse SSH tunnel maps Uberspace `127.0.0.1:18789` to Pi `127.0.0.1:18789`.

## 1) What Runs Where

| Component | Host | Process manager | Port |
|---|---|---|---|
| OpenClaw Gateway | Raspberry Pi | `systemd --user` (`openclaw-gateway`) | `127.0.0.1:18789` |
| Reverse tunnel | Raspberry Pi | manual SSH (or optional systemd service) | `-R 127.0.0.1:18789:127.0.0.1:18789` |
| Telegram bot (`dist/bot/index.js`) | Uberspace | `supervisor` (`robinhoodcoin-bot`) | outbound only |
| Optional autonomy daemon | Uberspace | `supervisor` (`robinhoodcoin-autonomy`) | outbound only |
| Static website | Uberspace | deploy script (`rsync`) | `~/html/<WEB_SUBDIR>` |

## 2) One-Time Setup on Raspberry Pi

### 2.1 Prereqs

```bash
sudo apt update
sudo apt install -y curl build-essential
```

Install Node 22 with `nvm` (if missing):

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22
node -v
```

### 2.2 OpenClaw configure (Codex OAuth)

Run interactive model setup:

```bash
npx --yes openclaw@2026.2.22-2 configure --section model
```

Choose:
- Gateway location: `Local (this machine)`
- Auth: `OpenAI Code (Codex) OAuth`

If prompted with `Paste the redirect URL`:
1. Open the shown `https://auth.openai.com/...` URL in your local browser.
2. Complete login/consent.
3. Copy full callback URL (`http://localhost:1455/auth/callback?...`).
4. Paste it back into the Pi terminal prompt.

### 2.3 Force loopback bind (required for secure tunnel mode)

```bash
npx --yes openclaw@2026.2.22-2 config set gateway.bind loopback
```

### 2.4 Gateway service

If not already installed, create:
`~/.config/systemd/user/openclaw-gateway.service`

```ini
[Unit]
Description=OpenClaw Gateway
After=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash -lc 'npx --yes openclaw@2026.2.22-2 gateway --port 18789'
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

Enable/start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now openclaw-gateway
systemctl --user status openclaw-gateway
```

Optional (keep user services running without active SSH session):

```bash
sudo loginctl enable-linger pi
```

### 2.5 Provider Keys via `~/.openclaw/.env` (optional)

OpenClaw runs under `systemd --user`, so it won't automatically read your repo `.env`.

This repo includes a helper that syncs selected keys (for example `NVIDIA_API_KEY`) into
OpenClaw's env file and ensures the gateway service loads it:

```bash
cd ~/robinhoodcoin-freeland
bash scripts/raspberrypi/sync-openclaw-env.sh
systemctl --user restart openclaw-gateway
```

The script writes to:
- `~/.openclaw/.env` (chmod 600)
- `~/.config/systemd/user/openclaw-gateway.service.d/env.conf` (`EnvironmentFile=-%h/.openclaw/.env`)

### 2.6 Pi health check

```bash
ss -ltn | grep 18789

TOKEN="$(python3 - <<'PY'
import json, os
print(json.load(open(os.path.expanduser('~/.openclaw/openclaw.json')))['gateway']['auth']['token'])
PY
)"

curl -sS -m 20 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "x-openclaw-agent-id: main" \
  -H "x-openclaw-agent-role: soul" \
  -d '{"model":"openai-codex/gpt-5.3-codex","messages":[{"role":"user","content":"reply ok"}],"max_tokens":16}' \
  http://127.0.0.1:18789/v1/chat/completions
```

Expected: JSON response with `"content":"ok"` (or similar assistant output).

## 3) One-Time Setup on Uberspace

### 3.1 Node + repo + deploy

```bash
uberspace tools version use node 22
git clone <repo-url> ~/robinhoodcoin-freeland
cd ~/robinhoodcoin-freeland
bash deploy/uberspace/deploy.sh
```

This installs supervisor service files:
- `~/etc/services.d/robinhoodcoin-bot.ini`
- `~/etc/services.d/robinhoodcoin-autonomy.ini`

## 4) Runtime Start Order (Important)

### Step A: Keep reverse tunnel open from Pi -> Uberspace

Run on Pi in a dedicated terminal and keep it running:

```bash
ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -R 127.0.0.1:18789:127.0.0.1:18789 \
  eggman3@lynx.uberspace.de
```

Optional automation with `systemd --user`:
- `deploy/raspberrypi/openclaw-tunnel-service.md`
- installer script: `scripts/raspberrypi/install-openclaw-tunnel.sh`

### Step B: Configure Uberspace `.env` to use tunneled gateway

On Uberspace:

```bash
cd ~/robinhoodcoin-freeland
```

Set:
- `AI_PROVIDER=openclaw`
- `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`
- `OPENCLAW_MODEL=openai-codex/gpt-5.3-codex`
- `OPENCLAW_CHAT_COMPLETIONS_PATH=/v1/chat/completions`
- `OPENCLAW_GATEWAY_TOKEN=<Pi gateway token from ~/.openclaw/openclaw.json>`

Quick verify:

```bash
grep -E '^(AI_PROVIDER|OPENCLAW_GATEWAY_URL|OPENCLAW_GATEWAY_TOKEN|OPENCLAW_MODEL|OPENCLAW_CHAT_COMPLETIONS_PATH)=' .env \
  | sed 's/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=<set>/'
```

### Step C: Uberspace gateway reachability + auth check

```bash
nc -vz 127.0.0.1 18789

TOKEN="$(grep '^OPENCLAW_GATEWAY_TOKEN=' .env | cut -d= -f2-)"
curl -sS -m 20 \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "x-openclaw-agent-id: main" \
  -H "x-openclaw-agent-role: soul" \
  -d '{"model":"openai-codex/gpt-5.3-codex","messages":[{"role":"user","content":"reply ok"}],"max_tokens":16}' \
  http://127.0.0.1:18789/v1/chat/completions
```

### Step D: start bot

```bash
supervisorctl restart robinhoodcoin-bot
supervisorctl status robinhoodcoin-bot
```

## 5) Deploy/Update Procedure

On Uberspace:

```bash
cd ~/robinhoodcoin-freeland
git pull
bash deploy/uberspace/deploy.sh
supervisorctl restart robinhoodcoin-bot
```

Optional:

```bash
START_AUTONOMY=true bash deploy/uberspace/deploy.sh
```

## 6) Healthcheck Commands

### Pi

```bash
systemctl --user is-active openclaw-gateway
ss -ltn | grep 18789
systemctl --user status openclaw-tunnel --no-pager
```

### Uberspace

```bash
nc -vz 127.0.0.1 18789
supervisorctl status robinhoodcoin-bot robinhoodcoin-autonomy
tail -n 80 ~/logs/robinhoodcoin/bot.err.log
tail -n 80 ~/logs/robinhoodcoin/bot.log
```

### Validate bot runtime env actually loaded

```bash
PID=$(supervisorctl status robinhoodcoin-bot | sed -n 's/.*pid \([0-9]\+\).*/\1/p')
tr '\0' '\n' < /proc/$PID/environ \
  | grep -E '^(AI_PROVIDER|OPENCLAW_GATEWAY_URL|OPENCLAW_GATEWAY_TOKEN|OPENCLAW_MODEL)=' \
  | sed 's/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=<loaded>/'
```

## 7) Troubleshooting

### `OpenClaw gateway auth error 401` (bot log)

Cause:
- wrong `OPENCLAW_GATEWAY_TOKEN` on Uberspace.

Fix:
1. Read token on Pi from `~/.openclaw/openclaw.json`.
2. Update Uberspace `.env` token.
3. Restart `robinhoodcoin-bot`.

### `Call to 'getUpdates' failed (409 Conflict)`

Cause:
- more than one Telegram polling bot instance with same bot token.

Fix:

```bash
supervisorctl stop robinhoodcoin-bot || true
pkill -f 'dist/bot/index.js' || true
pkill -f 'tsx.*src/bot/index.ts' || true
sleep 2
supervisorctl start robinhoodcoin-bot
pgrep -af 'dist/bot/index.js|tsx.*src/bot/index.ts'
```

Also stop any dev bot running on Mac/Pi with same Telegram token.

### `curl 127.0.0.1:18789` fails on Pi

Cause:
- gateway bound to LAN (`0.0.0.0`) instead of loopback for this flow.

Fix:

```bash
npx --yes openclaw@2026.2.22-2 config set gateway.bind loopback
systemctl --user restart openclaw-gateway
```

### Uberspace cannot reach `100.x` Tailnet IP

Cause:
- Uberspace host is outside your Tailnet route.

Fix:
- use reverse SSH tunnel (`ssh -R`) from Pi to Uberspace (documented above).

## 8) Operational Notes

- Keep the tunnel terminal alive, or automate it with a Pi user service later.
- Re-running OpenClaw OAuth on Pi can rotate gateway/auth state. After that, re-check token sync on Uberspace.
- `deploy/uberspace/deploy.sh` does not overwrite your `.env`; env correctness is your responsibility.

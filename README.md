# 🏹 RobinHoodCoin — Freeland Initiative

**A crypto-powered collective buying real land for communities.**

RobinHoodCoin (RHC) is a Solana-based DAO that pools resources from its members to purchase real-world land ("freeland") and designate it as self-governed community commons. Inspired by the legend of Robin Hood, the project redistributes collective wealth into tangible freedom.

---

## 📘 Project Brief (English)

### 1. Vision and Mission
RobinHoodCoin is a crypto-powered collective that acquires real land for communities. The mission is to convert concentrated wealth into **Freeland**: physical, self-governed commons withdrawn from speculative markets.

Core goals:
- acquire land for autonomous community spaces,
- allocate part of the treasury to grassroots charitable causes.

### 2. Funding Model and Token Design
- **RobinHoodCoin (RHC)** is the governance token (total supply: 1,000,000,000) used for DAO voting on land purchases and treasury allocation.
- **Freeland Stamp NFTs** are the crowdfunding instrument, organized in tiers (Genesis, Supporter, Parcel, Patron) with governance and recognition benefits.

### 3. Treasury Transparency (70/20/10 Rule)
All incoming funds follow the charter distribution:
- **70%** land acquisition,
- **20%** charitable Robin Hood causes,
- **10%** operations (hosting, tech, legal).

Treasury execution uses a **Squads v4 multisig** with majority approval (minimum 2-of-3). Large land purchases (>10,000 SOL) require full DAO voting.

### 4. Soul Network and OpenClaw Autonomy
The operational core is a role-based AI network:
- **Soul Prime** (coordination),
- **Little John** (land scouting),
- **Marian** (finance),
- **Friar Tuck** (moderation),
- **Allan-a-Dale** (governance),
- plus **PR** role support.

This repository implements OpenClaw role routing plus autonomous loops for role reports, land scouting, finance monitoring, and an orchestrated RobinHood autonomy experience.

### 5. Implementation Roadmap
1. Foundation (team, charter, token, bot),
2. Launch (NFT sale, community growth, website),
3. First acquisition (DAO-voted first Freeland parcel),
4. Development (local councils and on-site infrastructure),
5. Scaling (multi-region chapters and DAO partnerships).

### 6. Security and Governance
- decentralized decisions via DAO + multisig,
- self-hosted bot runtime for data sovereignty,
- open-source charter and code for chapter replication.

_“The forest grows one tree at a time.”_

---

## 📁 Project Structure

```
robinhoodcoin-freeland/
├── src/
│   ├── shared/
│   │   └── config.ts          # Centralized configuration (env vars, constants)
│   ├── token/
│   │   └── deploy.ts          # Deploy the RHC SPL token on Solana
│   ├── nft/
│   │   ├── deploy.ts          # Create the Freeland Stamps NFT collection
│   │   ├── mint-stamp.ts      # Mint individual stamp NFTs
│   │   └── metadata/
│   │       └── collection.json # NFT collection metadata template
│   ├── bot/
│   │   ├── index.ts           # Telegram bot entry point (grammY)
│   │   └── commands/
│   │       ├── start.ts       # /start — welcome message
│   │       ├── help.ts        # /help — command list
│   │       ├── mission.ts     # /mission — project vision
│   │       ├── treasury.ts    # /treasury — live balance query
│   │       ├── autonomy.ts    # /autonomy — run full OpenClaw experience cycle
│   │       └── ask.ts         # Free-text AI Q&A (Anthropic/OpenAI/OpenClaw)
│   ├── dao/
│   │   └── governance.ts      # Off-chain proposal & voting system
│   └── treasury/
│       └── setup-multisig.ts  # Create a Squads v4 multisig treasury
├── site/
│   ├── index.html             # Landing page
│   ├── style.css              # Styles
│   └── main.js                # Client-side logic
├── plan.md                    # Full project vision & roadmap
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
└── .gitignore
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Solana CLI** (for keypair generation): `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`

### 1. Clone & Install

```bash
git clone https://github.com/your-org/robinhoodcoin-freeland.git
cd robinhoodcoin-freeland
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Generate a Solana Keypair (devnet)

```bash
mkdir -p keys
solana-keygen new -o keys/deployer.json --no-bip39-passphrase
solana airdrop 2 $(solana-keygen pubkey keys/deployer.json) --url devnet
```

---

## 🪙 Deploy RobinHoodCoin Token

```bash
npm run deploy:token
```

This creates an SPL token on Solana devnet with:
- **Name**: RobinHoodCoin
- **Symbol**: RHC
- **Decimals**: 9
- **Total Supply**: 1,000,000,000

The full supply is minted to the deployer's associated token account (the initial treasury).

**Output**: Mint address printed to console — save it in `.env` as `RHC_MINT_ADDRESS`.

### Transfer Mint Authority to Multisig (Recommended)

```bash
npm run transfer:mint-authority -- --mint <RHC_MINT_ADDRESS> --to <TREASURY_MULTISIG_ADDRESS>
```

After transfer, set `RHC_MINT_AUTHORITY=<TREASURY_MULTISIG_ADDRESS>` in `.env` so custody status is visible in the web dashboard.

---

## 🎨 Deploy Freeland Stamp NFTs

### Create the Collection

```bash
npm run deploy:nft
```

Creates a Metaplex collection NFT. Collection info saved to `keys/collection-info.json`.

### Mint Individual Stamps

```bash
npx tsx src/nft/mint-stamp.ts \
  --name "Genesis Stamp #1" \
  --uri "https://robinhoodcoin.org/api/metadata/genesis-1.json"
```

Each stamp is minted as an NFT within the collection. Artwork should be generated with AI image tools and metadata hosted at the configured `NFT_BASE_URI`.

---

## 🤖 Telegram Bot (OpenClaw)

The bot uses [grammY](https://grammy.dev/) and supports Anthropic, OpenAI, or an OpenClaw gateway for AI-powered Q&A.

### Setup

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Set `TELEGRAM_BOT_TOKEN` in `.env`
3. Set `AI_PROVIDER` (`anthropic`, `openai`, or `openclaw`) in `.env`
4. For `anthropic`/`openai`, set `AI_API_KEY`
5. For `openclaw`, set `OPENCLAW_GATEWAY_URL` and gateway token/password if auth is enabled
6. Optionally map role routing to OpenClaw agents (`OPENCLAW_AGENT_LAND_SCOUT_ID`, `OPENCLAW_AGENT_FINANCE_ID`, etc.)
7. Optional fallback + model switching (OpenClaw primary, NVIDIA Kimi fallback):
   - set `AI_RUNTIME_MODEL_ORDER=openclaw,nvidia-kimi`
   - set `AI_RUNTIME_DEFAULT_MODEL=openclaw`
   - keep `AI_RUNTIME_AUTO_SWITCH=true` for automatic failover
   - optional persistence target: `AI_RUNTIME_PERSIST_FILE=.env`
   - optional restart hook after switch: set `AI_RUNTIME_RESTART_COMMAND`
     (example: `systemctl --user restart openclaw-gateway`)
   - set `NVIDIA_API_KEY` (and optionally `NVIDIA_MODEL`, default `moonshotai/kimi-k2.5`)
   - use `/model` in Telegram to view/switch active runtime model
8. Recommended for solid campaign mode (chat + autonomy in one switch):
   - set `OPENCLAW_CAMPAIGN_MODE=true`
   - this auto-enables: OpenClaw provider, chat AI, orchestrated experience loop (exclusive), and fusion driver
9. If you want autonomy-first (not chat-first):
   - set `BOT_CHAT_AI_ENABLED=false` (disables free-text AI chat replies)
   - set `OPENCLAW_AUTONOMOUS_ENABLED=true`
   - pick workers with `OPENCLAW_AUTONOMOUS_ROLES` (for example `governance,pr,moderator`)
   - tune `OPENCLAW_AUTONOMOUS_INTERVAL_MS`
   - optionally set `OPENCLAW_AUTONOMOUS_NOTIFY_CHAT_ID` for alerts
10. Optional autonomous land scout loop:
   - set `LAND_SCOUT_AUTONOMOUS_ENABLED=true`
   - tune interval and thresholds with `LAND_SCOUT_AUTONOMOUS_*` vars
   - optionally set `LAND_SCOUT_NOTIFY_CHAT_ID` for cycle reports
11. Optional autonomous finance monitor loop:
   - set `FINANCE_MONITOR_ENABLED=true`
   - tune thresholds with `FINANCE_MONITOR_*`
   - optionally set `FINANCE_MONITOR_NOTIFY_CHAT_ID` for alert posts
12. Optional **OpenClaw Autonomous RobinHood Experience** (single orchestrated cycle):
   - set `OPENCLAW_EXPERIENCE_ENABLED=true`
   - keep `OPENCLAW_EXPERIENCE_EXCLUSIVE=true` to avoid duplicate standalone loops
   - tune cadence with `OPENCLAW_EXPERIENCE_INTERVAL_MS`
   - optionally set `OPENCLAW_EXPERIENCE_NOTIFY_CHAT_ID` for mission dashboard posts
   - run on demand with `/autonomy`
13. OpenClaw fusion driver (mix DAO + users + stamps in one decision loop):
   - `OPENCLAW_FUSION_ENABLED=true`
   - tune `OPENCLAW_FUSION_MAX_ACTIONS`, `OPENCLAW_FUSION_MAX_TOKENS`, `OPENCLAW_FUSION_TEMPERATURE`
   - fusion executes safe actions such as launching parcel campaigns and creating/activating linked land proposals
14. Optional **headless fully autonomous mode** (no Telegram loop required):
   - set `OPENCLAW_DAEMON_ENABLED=true`
   - tune cadence with `OPENCLAW_DAEMON_INTERVAL_MS`
   - run with `npm run start:autonomy`
   - this mode executes:
     - OpenClaw role cycle,
     - autonomous land scout,
     - autonomous finance monitor,
     - autonomous governance executor (proposal drafting/activation by policy thresholds),
     - monthly transparency report generation.

### Run

```bash
# Development (hot reload)
npm run dev:bot

# Development in campaign mode (OpenClaw chat + autonomous campaign loop)
npm run dev:campaign

# Production
npm run build
npm run start:bot

# Production in campaign mode
npm run start:campaign

# Standalone fully autonomous daemon (headless)
npm run start:autonomy
```

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/mission` | Project vision & goals |
| `/treasury` | Live treasury balance |
| `/autonomy` | Run one full OpenClaw autonomous RobinHood experience cycle |
| `/model <name?>` | Show or switch runtime model (`openclaw`, `nvidia-kimi`) |
| `/stampmint <CAMP-ID> <qty?>` | Record a Stamp mint and update member governance profile |
| `/member` | Show your unified member profile (stamps + contribution + votes) |
| Free text | AI-powered Q&A about the project (`BOT_CHAT_AI_ENABLED=true`) |

### Fully Autonomous By Itself (Headless Runtime)

If you want OpenClaw to run independently from Telegram commands/chats, use the standalone daemon:

```bash
npm run dev:autonomy
# or
npm run start:autonomy
```

Key env controls:
- `OPENCLAW_DAEMON_ENABLED=true`
- `OPENCLAW_DAEMON_INTERVAL_MS=1800000`
- `OPENCLAW_FUSION_ENABLED=true`
- `AUTONOMY_EXECUTOR_ENABLED=true`
- `AUTONOMY_EXECUTOR_AUTO_ACTIVATE_PROPOSALS=true`
- `AUTONOMY_EXECUTOR_OPPORTUNITY_MIN_SCORE=80`
- `AUTONOMY_EXECUTOR_LAND_MIN_SCORE=82`

State/log outputs:
- `data/autonomy/daemon-cycles.jsonl`
- `data/autonomy/executor-state.json`
- `site/public/data/dashboard.json` (auto-synced each daemon cycle)

### Hosting on Uberspace

If you deploy or operate this stack on a Raspberry Pi, see headless SSH recovery:
- `deploy/raspberrypi/headless-ssh.md`
- Reverse tunnel auto-start service (Pi -> Uberspace):
  `deploy/raspberrypi/openclaw-tunnel-service.md`
- Desktop kiosk terminal for the live OpenClaw dashboard on Pi login:
  `deploy/raspberrypi/openclaw-dashboard-kiosk.md`
- Enable NVIDIA Kimi model in OpenClaw allowlist/provider on Pi:
  `scripts/raspberrypi/enable-openclaw-nvidia-kimi.sh`
- Full Pi + Uberspace operations runbook (OpenClaw gateway, reverse tunnel, bot start order, troubleshooting):
  `deploy/uberspace/pi-uberspace-runbook.md`

```bash
# One-time setup on Uberspace (if Node is not set yet):
uberspace tools version use node 22

# Clone and deploy:
git clone <repo> ~/robinhoodcoin-freeland
cd ~/robinhoodcoin-freeland
bash deploy/uberspace/deploy.sh

# If Uberspace RAM is limited (npm ci gets killed), deploy from local build:
UBERSPACE_USER=<user> UBERSPACE_HOST=<host> \
  bash deploy/uberspace/deploy-local.sh

# Single-command local build + upload + restart (reads .env by default):
./deploy_uberspace
# or
npm run deploy_uberspace
```

The deploy script will:
- run `npm ci`, `npm run build`, and `npm run build:web`
- publish the static site to `~/html/robinhoodcoin/` (customizable)
- symlink `~/html/robinhoodcoin/data -> site/public/data` so daemon-updated dashboard JSON is live
- install supervisor service `~/etc/services.d/robinhoodcoin-bot.ini` (`autostart=true`)
- optionally install `~/etc/services.d/robinhoodcoin-autonomy.ini` only when `AUTONOMY_SERVICE_ENABLED=true`

After deploy, common operations:
```bash
# Refresh from git and redeploy
git pull
bash deploy/uberspace/deploy.sh

# Service control
supervisorctl status robinhoodcoin-bot robinhoodcoin-autonomy
supervisorctl restart robinhoodcoin-bot
supervisorctl start robinhoodcoin-autonomy
supervisorctl stop robinhoodcoin-autonomy
```

Optional deploy flags:
```bash
# Publish under a custom subdirectory
WEB_SUBDIR=freeland bash deploy/uberspace/deploy.sh

# Publish at domain root (~/html)
WEB_SUBDIR= bash deploy/uberspace/deploy.sh

# Also install autonomy supervisor service (optional)
AUTONOMY_SERVICE_ENABLED=true bash deploy/uberspace/deploy.sh

# Also start autonomy service during deploy
START_AUTONOMY=true bash deploy/uberspace/deploy.sh

# Local build + remote runtime deploy (no npm ci on Uberspace)
UBERSPACE_USER=<user> UBERSPACE_HOST=<host> START_AUTONOMY=true \
  bash deploy/uberspace/deploy-local.sh

# Wrapper command with env file + overrides
START_AUTONOMY=true WEB_SUBDIR=freeland ./deploy_uberspace

# Password-based SSH deploy (if no key auth is configured)
SSH_PASSWORD='<uberspace-password>' ./deploy_uberspace
# (`SSH_KEY` from .env is also accepted)
```

---

## 🏦 Treasury Multisig

Uses [Squads Protocol v4](https://squads.so/) for multi-signature treasury management.

### Create Multisig

```bash
npx tsx src/treasury/setup-multisig.ts \
  --members <pubkey1>,<pubkey2>,<pubkey3> \
  --threshold 2
```

This creates a 2-of-3 multisig. The vault address should be saved in `.env` as `TREASURY_MULTISIG_ADDRESS`.

### Transaction Flow

1. Any signer proposes a transaction (e.g., send SOL to buy land)
2. Other signers approve via Squads UI or CLI
3. Once threshold is met, the transaction executes

---

## 🗳️ DAO Governance

### v1: Off-Chain Proposals + On-Chain Execution

Proposals are stored as JSON files in `data/proposals/`. The governance module (`src/dao/governance.ts`) provides:

- `createProposal()` — Draft a new proposal
- `activateProposal()` — Open voting
- `vote()` — Cast a vote
- `finalizeProposal()` — Tally and determine outcome
- `listProposals()` — View all proposals

### Proposal Types

| Type | Description |
|------|-------------|
| `land_purchase` | Vote to buy a specific property |
| `grant` | Allocate funds to a charitable cause |
| `parameter_change` | Modify DAO parameters |
| `general` | Open-ended proposals |

### Future: On-Chain Governance

v2 will integrate [SPL Governance](https://github.com/solana-labs/solana-program-library/tree/master/governance) or [Realms](https://realms.today/) for fully on-chain, token-weighted voting.

---

## 🌐 Website

```bash
# Development server (port 3000)
npm run dev:web

# Sync live DAO/bot data into frontend JSON
npm run sync:web-data

# Build for production
npm run build:web
# Output: site/dist/
```

The website includes:
- Hero with live stats (treasury balance, member count)
- Mission & how-it-works sections
- Freeland Stamp NFT showcase
- Roadmap timeline
- Transparency section (contract addresses)
- Security posture and latest report status from `site/public/data/dashboard.json`

---

## 📋 Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Foundation | ✅ | Core team, charter, AI bot, token creation |
| 2. Launch | 🔄 | NFT sale, community outreach, website |
| 3. First Acquisition | ⏳ | Identify, vote, purchase first parcel |
| 4. Scale | ⏳ | Expand network, partner with aligned DAOs |

---

## 🔒 Security Considerations

- **Mint authority**: Transfer to multisig after initial supply is minted
- **Multisig threshold**: Use at least 2-of-3 for treasury operations
- **Smart contract verification**: All deployed contracts should be verified on-chain
- **AI bot**: Self-hosted on Uberspace — no third-party data exposure
- **Key management**: Never commit `keys/` or `.env` to version control
- **Custody visibility**: Keep `RHC_MINT_AUTHORITY` in `.env` and run `npm run sync:web-data` after governance or treasury changes

---

## 📜 License

This project is dedicated to the public domain. No rights reserved — this is for everyone.

In the spirit of Robin Hood: take this code, use it for good, and create freedom.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

All contributions are welcome — code, documentation, artwork, legal advice, or just spreading the word.

---

*"Wealth gathered through the coin is redistributed to worthy grassroots initiatives."*

🏹 Join the clan. Create freedom. One parcel at a time.

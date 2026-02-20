# 🏹 RobinHoodCoin — Freeland Initiative

**A crypto-powered collective buying real land for communities.**

RobinHoodCoin (RHC) is a Solana-based DAO that pools resources from its members to purchase real-world land ("freeland") and designate it as self-governed community commons. Inspired by the legend of Robin Hood, the project redistributes collective wealth into tangible freedom.

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
│   │       └── ask.ts         # Free-text AI Q&A (Anthropic API)
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

The bot uses [grammY](https://grammy.dev/) and supports Anthropic or OpenAI for AI-powered Q&A.

### Setup

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Set `TELEGRAM_BOT_TOKEN` in `.env`
3. Set `AI_PROVIDER` (`anthropic` or `openai`) and `AI_API_KEY` in `.env`

### Run

```bash
# Development (hot reload)
npm run dev:bot

# Production
npm run build
npm run start:bot
```

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/mission` | Project vision & goals |
| `/treasury` | Live treasury balance |
| Free text | AI-powered Q&A about the project |

### Hosting on Uberspace

```bash
# On your Uberspace server:
git clone <repo> ~/robinhoodcoin
cd ~/robinhoodcoin && npm install && npm run build

# Create a supervisord service:
supervisorctl reread
supervisorctl update
supervisorctl start robinhoodcoin-bot
```

Example `~/etc/services.d/robinhoodcoin-bot.ini`:
```ini
[program:robinhoodcoin-bot]
command=node /home/<user>/robinhoodcoin/dist/bot/index.js
autostart=yes
autorestart=yes
environment=NODE_ENV="production"
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

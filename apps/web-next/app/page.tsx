import Link from "next/link";
import { db } from "../lib/db";
import { isVerifiedParcel } from "../lib/parcels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const communityUrl = process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "https://t.me/robinhoodcoin";
  const paypalSupportUrl = process.env.NEXT_PUBLIC_PAYPAL_SUPPORT_URL ?? "";
  const [trackedLeads, topParcel, cheapestParcel, shortlist] = await Promise.all([
    db.parcel.count(),
    db.parcel.findFirst({
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      select: { score: true },
    }),
    db.parcel.findFirst({
      where: { priceUsd: { not: null } },
      orderBy: [{ priceUsd: "asc" }, { score: "desc" }, { createdAt: "desc" }],
      select: { priceUsd: true },
    }),
    db.parcel.findMany({
      where: {
        priceUsd: { not: null },
        sizeAcres: { not: null },
        status: { not: "lane" },
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: { id: true, title: true, location: true, score: true, status: true, sizeAcres: true, priceUsd: true },
    }),
  ]);

  return (
    <main style={{ display: "grid", gap: 26 }}>
      <section
        style={{
          borderRadius: 16,
          border: "1px solid #2a3a2e",
          padding: 24,
          background: "radial-gradient(1000px 400px at 50% -80px, rgba(76,175,80,0.22), rgba(8,12,10,0.92))",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
        >
          <strong style={{ color: "#fcd34d" }}>RobinHoodCoin</strong>
          <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
            <a href="#mission" style={{ color: "#9ca3af", textDecoration: "none" }}>Mission</a>
            <a href="#freeland" style={{ color: "#9ca3af", textDecoration: "none" }}>Freeland</a>
            <a href="#governance" style={{ color: "#9ca3af", textDecoration: "none" }}>Governance</a>
            <a href="#team" style={{ color: "#9ca3af", textDecoration: "none" }}>Team</a>
            <a href="#community" style={{ color: "#9ca3af", textDecoration: "none" }}>Community</a>
            <a href="#charter" style={{ color: "#9ca3af", textDecoration: "none" }}>Charter</a>
            <a href="#how" style={{ color: "#9ca3af", textDecoration: "none" }}>How It Works</a>
            <a href="#stamps" style={{ color: "#9ca3af", textDecoration: "none" }}>Stamps</a>
            <a href="#portfolio" style={{ color: "#9ca3af", textDecoration: "none" }}>Portfolio</a>
            <a href="#roadmap" style={{ color: "#9ca3af", textDecoration: "none" }}>Roadmap</a>
            <Link href="/movement" style={{ color: "#9ca3af", textDecoration: "none" }}>Movement</Link>
            <Link href="/land" style={{ color: "#9ca3af", textDecoration: "none" }}>Land Objects</Link>
            <Link href="/voting" style={{ color: "#9ca3af", textDecoration: "none" }}>Votings</Link>
            <Link href="/soul" style={{ color: "#9ca3af", textDecoration: "none" }}>Soul Console</Link>
          </nav>
        </div>
        <span
          style={{
            display: "inline-block",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #35523f",
            background: "#17271f",
            color: "#fcd34d",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 14,
          }}
        >
          Freeland Initiative
        </span>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(2rem,5vw,3.3rem)", lineHeight: 1.1 }}>
          Create Freedom.
          <br />
          One Parcel at a Time.
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: 18, color: "#cbd5e1", maxWidth: 760 }}>
          A crypto-powered collective buying real land for communities. Governed by the people who fund it.
          Transparent, decentralized, and mission-locked.
        </p>
        <p style={{ margin: 0, color: "#94a3b8", maxWidth: 760 }}>
          We invite people to pool resources into shared land and shared freedom.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
          <Link
            href="/portfolios"
            style={{
              background: "#4caf50",
              color: "#04120a",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Explore Parcels
          </Link>
          <a
            href="https://t.me/robinhoodcoin"
            target="_blank"
            rel="noreferrer"
            style={{
              border: "1px solid #4caf50",
              color: "#4caf50",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Join Telegram
          </a>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Tracked Leads" value={String(trackedLeads)} color="#fcd34d" />
        <StatCard label="Top Score" value={topParcel?.score?.toString() ?? "?"} color="#4ade80" />
        <StatCard label="Lowest Known Price" value={`$${cheapestParcel?.priceUsd?.toLocaleString() ?? "?"}`} color="#60a5fa" />
        <StatCard label="Platform" value="Live" color="#f472b6" />
      </section>

      <section
        id="mission"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Mission and Charter</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1" }}>
          Inspired by Robin Hood as redistribution for the common good: buy communal land, support social causes,
          and keep every decision open to DAO governance.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <FeatureCard title="Acquire Freeland" body="Purchase real land and remove it from speculation. Treat it as common infrastructure." />
          <FeatureCard title="Support Causes" body="Reserve a mission slice for social projects and mutual-aid impact." />
          <FeatureCard title="DAO Governance" body="Token holders govern proposals and treasury movements with transparent audit trails." />
        </div>
        <ul style={{ margin: "16px 0 0", paddingLeft: 18, color: "#a7b1be" }}>
          <li>Funds are restricted to land and aligned charitable outcomes.</li>
          <li>Parcels are not flipped for private profit.</li>
          <li>Treasury operations stay public and traceable.</li>
          <li>Local parcel councils govern daily use under DAO charter guardrails.</li>
        </ul>
      </section>

      <section
        id="freeland"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>What Is Freeland?</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1" }}>
          Freeland is real, physical land purchased by the Robin Hood DAO and designated as a self-governed community commons.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 10 }}>
          {[
            "🏡 Community Living",
            "🌾 Urban & Rural Farming",
            "🔧 Hacker Spaces & Maker Labs",
            "🏛️ Community Centers",
            "🌳 Nature Conservation",
            "🏥 Emergency Shelter & Mutual Aid",
          ].map((item) => (
            <div key={item} style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
              {item}
            </div>
          ))}
        </div>
        <p style={{ margin: "12px 0 0", color: "#94a3b8" }}>
          Each parcel has a local Merry Men council for daily governance, with the DAO ensuring alignment with the charter.
        </p>
      </section>

      <section
        id="governance"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Governance &amp; Merry Men Council</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1" }}>
          Each parcel has a local Merry Men council for day-to-day governance, while the DAO enforces the charter and treasury rules.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <FeatureCard title="Local Stewardship" body="On-the-ground councils decide practical use, maintenance, and community norms." />
          <FeatureCard title="DAO Oversight" body="RHC holders vote on acquisitions, budgets, and policy changes." />
          <FeatureCard title="Multisig Control" body="Treasury releases require multisig approvals for execution safety." />
        </div>
        <p style={{ margin: "12px 0 0", color: "#94a3b8" }}>
          Land purchases above 10,000 SOL require a full DAO vote.
        </p>
      </section>

      <section
        id="team"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Team / Sherwood</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1", maxWidth: 860 }}>
          RobinHoodCoin is the public movement, treasury, and governance layer. Sherwood is the AI operations layer:
          the Soul Console, scouting workflows, and practical support systems that help the movement execute.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 12 }}>
          <FeatureCard
            title="RobinHoodCoin"
            body="The public initiative. It handles mission, fundraising, token governance, land acquisition, and the DAO-facing narrative."
          />
          <FeatureCard
            title="Sherwood"
            body="The operational intelligence layer. It runs the AI soul, scout loops, runbooks, and the support console for day-to-day execution."
          />
          <FeatureCard
            title="Merry Men Council"
            body="The human stewardship layer. Contributors, organizers, and local councils shape use of land, proposals, and community norms."
          />
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 12 }}>
          <article style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h3 style={{ margin: "0 0 6px" }}>What Sherwood Is Not</h3>
            <p style={{ margin: 0, color: "#94a3b8" }}>
              Sherwood is not a separate company or public token brand. It is the internal operating face of the RobinHoodCoin mission.
            </p>
          </article>
          <article style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h3 style={{ margin: "0 0 6px" }}>Public Entry Points</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/soul" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
                Open Sherwood →
              </Link>
              <Link href="/movement" style={{ color: "#4ade80", textDecoration: "none", fontWeight: 700 }}>
                Open Movement →
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section
        id="charter"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>The Charter — Laws of Robin Hood Coin</h2>
        <ol style={{ margin: 0, paddingLeft: 18, color: "#cbd5e1" }}>
          <li>All funds raised must be used exclusively for buying communal land or supporting charitable causes.</li>
          <li>Every acquired parcel is permanently removed from the speculative market.</li>
          <li>Decisions are made democratically by RHC token holders.</li>
          <li>Full transparency: every contribution, expenditure, and decision is publicly trackable on-chain.</li>
          <li>The project operates in the spirit of Robin Hood: redistribute wealth toward the common good.</li>
          <li>Each freeland parcel is self-governed by its local community, with strategic oversight by the DAO.</li>
          <li>Violence, exclusion, and discrimination have no place in any freeland space.</li>
          <li>The AI Soul serves the mission, not individual interests.</li>
        </ol>
      </section>

      <section
        id="how"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Campaign Flow</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <StepCard
            n="1"
            title="Get RHC or a Freeland Stamp"
            body="RHC is the governance layer. Freeland Stamps are campaign collectibles that fund parcels directly. Both are participation tools, not isolated products."
          />
          <StepCard
            n="2"
            title="Vote on Proposals"
            body="The community proposes land targets and causes. RHC holders vote. Use the Telegram bot commands /propose and /vote."
          />
          <StepCard
            n="3"
            title="Land Is Acquired"
            body="Treasury funds are released via multisig. A legal entity (LLC or foundation) holds the deed on behalf of the DAO."
          />
          <StepCard
            n="4"
            title="Community Thrives"
            body="The land becomes a self-governed community space. Local participants form a council, and the Soul coordinates operations."
          />
        </div>
      </section>

      <section
        id="community"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Community, Collectors, and Social Space</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1", maxWidth: 920 }}>
          The system works best when funding, governance, collecting, and discussion stay connected. A stamp should not end as a dead collectible,
          and a parcel should not live without community conversation around it.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
          <FeatureCard
            title="Collectors Become Backers"
            body="Stamp collectors are parcel backers. Their mint activity should flow into campaigns, visible support, and governance weight."
          />
          <FeatureCard
            title="Discussion Lives With Land"
            body="Every parcel detail page is also a discussion surface for due diligence, local knowledge, and ideas for future community use."
          />
          <FeatureCard
            title="Soul Organizes Context"
            body="Sherwood and the Soul connect scout leads, member questions, campaigns, and movement updates so the system feels alive rather than fragmented."
          />
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={communityUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              background: "#4caf50",
              color: "#04120a",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Join Community Chat
          </a>
          <Link
            href="/movement"
            style={{
              display: "inline-block",
              border: "1px solid #4caf50",
              color: "#4caf50",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Read Movement Feed
          </Link>
          <Link
            href="/soul"
            style={{
              display: "inline-block",
              border: "1px solid #fcd34d",
              color: "#fcd34d",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open Soul Console
          </Link>
        </div>
      </section>

      <section
        id="stamps"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Freeland Stamps</h2>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>
          Freeland Stamps are the collector-facing funding rail for parcels. They should connect minting, public support, social identity, and governance context around real land campaigns.
        </p>
        <div style={{ marginBottom: 14, border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
          <h3 style={{ marginTop: 0, color: "#fcd34d" }}>How Stamps and RobinHoodCoin Fit Together</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
            <FeatureCard
              title="RHC"
              body="Governance, proposals, treasury signaling, and long-term participation weight."
            />
            <FeatureCard
              title="Stamps"
              body="Campaign-level funding, collector identity, visible support for a specific parcel or mission."
            />
            <FeatureCard
              title="Soul + Sherwood"
              body="The coordination layer that explains campaigns, answers questions, and keeps collectors, voters, and scout discussions connected."
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
          <StampCard
            name="Genesis Stamp"
            price="1 SOL"
            supply="0 / 1,000 minted"
            badge="LIMITED"
            perks={["Founding member badge", "Early access to all drops", "Vote weight bonus", "Genesis Wall inscription"]}
          />
          <StampCard
            name="Supporter Stamp"
            price="0.5 SOL"
            supply="Unlimited"
            badge=""
            perks={["Proof of contribution", "Supporters-only channel", "Monthly transparency reports"]}
          />
          <StampCard
            name="Parcel Stamp"
            price="2 SOL"
            supply="500 per campaign"
            badge=""
            perks={["Direct contribution to a parcel", "Unique AI-generated artwork", "Voting priority on that parcel"]}
          />
          <StampCard
            name="Patron Stamp"
            price="10 SOL"
            supply="0 / 100 minted"
            badge="PATRON"
            perks={["All lower-tier benefits", "Enhanced vote weight", "Advisory seat on council", "Patron Wall feature"]}
          />
        </div>

        <div style={{ marginTop: 18, border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
          <h3 style={{ marginTop: 0, color: "#fcd34d" }}>Active Campaigns</h3>
          <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
            No public stamp sale is live yet. The minting machinery exists, but the community-facing campaign layer still needs tighter rollout and storytelling.
          </p>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            Next milestone: launch a parcel-linked stamp campaign that clearly shows target land, funding goal, minted supply, collector rewards, and discussion flow.
          </p>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h4 style={{ marginTop: 0 }}>Collectors & Discussion</h4>
            <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
              Supporters should be able to collect stamps, discuss parcels, and follow the social life of each campaign in one connected flow.
            </p>
            <a href={communityUrl} target="_blank" rel="noreferrer" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
              Open Community Chat →
            </a>
          </div>
          <div style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h4 style={{ marginTop: 0 }}>Land Objects Gallery</h4>
            <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
              Photo cards, parcel details, score, and acquisition fit for each shortlisted property.
            </p>
            <Link href="/land" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
              Open Land Gallery →
            </Link>
          </div>
          <div style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h4 style={{ marginTop: 0 }}>DAO Votings</h4>
            <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
              Track active proposals and vote status before treasury execution.
            </p>
            <Link href="/voting" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
              Open Votings →
            </Link>
          </div>
          <div style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
            <h4 style={{ marginTop: 0 }}>Support Operations</h4>
            <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
              Direct support rails can sit beside on-chain funding, but only through a deliberate public link. The site is ready for a public PayPal support button when configured.
            </p>
            {paypalSupportUrl ? (
              <a href={paypalSupportUrl} target="_blank" rel="noreferrer" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
                Support via PayPal →
              </a>
            ) : (
              <a href={communityUrl} target="_blank" rel="noreferrer" style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>
                Request support link in chat →
              </a>
            )}
          </div>
        </div>
      </section>

      <section
        id="portfolio"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Portfolio Snapshot</h2>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>
          Verified parcel-level listings from Prisma. Lane-level leads stay in the portfolio feed until parcel details are confirmed.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          {shortlist.filter(isVerifiedParcel).map((parcel) => (
            <article key={parcel.id} style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
              <strong>{parcel.title}</strong>
              <p style={{ margin: "4px 0", color: "#94a3b8", fontSize: 14 }}>{parcel.location}</p>
              <p style={{ margin: "4px 0", fontSize: 14 }}>Score: {parcel.score ?? "?"}</p>
              <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24", fontSize: 14 }}>
                Open details
              </Link>
            </article>
          ))}
          {shortlist.filter(isVerifiedParcel).length === 0 ? (
            <p style={{ color: "#9ca3af" }}>No parcel-level listings synced yet. Scout leads are still visible in the portfolio feed.</p>
          ) : null}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/portfolios"
            style={{
              display: "inline-block",
              background: "linear-gradient(90deg, #fcd34d, #f59e0b)",
              color: "#0a0f0d",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open Full Portfolio
          </Link>
          <Link
            href="/movement"
            style={{
              display: "inline-block",
              border: "1px solid #4caf50",
              color: "#4caf50",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Live Movement Log
          </Link>
        </div>
      </section>

      <section
        id="roadmap"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Roadmap</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <RoadmapCard
            phase="Phase 1 — Foundation"
            items={[
              "Core team assembly & charter drafting",
              "AI Soul bot deployment (Telegram)",
              "RHC token creation (Solana SPL)",
              "Multisig treasury setup (Squads v4)",
              "Website launch",
            ]}
            status="done"
          />
          <RoadmapCard
            phase="Phase 2 — Launch & Outreach"
            items={[
              "Genesis Stamp NFT sale (1,000 founding stamps)",
              "Community outreach (Twitter, Reddit, crypto forums)",
              "AMA sessions and press coverage",
              "Airdrop RHC to early contributors",
              "Discord & multi-platform bot deployment",
            ]}
            status="active"
          />
          <RoadmapCard
            phase="Phase 3 — First Acquisition"
            items={[
              "Scout land opportunities via Little John agent",
              "Community vote on target property",
              "Legal entity setup (LLC or foundation)",
              "Execute purchase via multisig",
              "Announce Freeland Parcel #1",
            ]}
            status="next"
          />
          <RoadmapCard
            phase="Phase 4 — Develop & Celebrate"
            items={[
              "Build infrastructure on the parcel",
              "Form local Merry Men council",
              "Open community workdays & events",
              "Document with photos, video, and reports",
            ]}
            status="next"
          />
          <RoadmapCard
            phase="Phase 5 — Scale"
            items={[
              "Launch Parcel #2 campaign",
              "Partner with aligned DAOs & land trusts",
              "Expand Soul network to new platforms",
              "Decentralized identity (Robin Hood Passport)",
              "Global network of freeland nodes",
            ]}
            status="next"
          />
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#0f172a" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0, color: "#a7b1be", fontSize: 14 }}>{body}</p>
    </article>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
      <span
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          background: "#4caf50",
          color: "#08120b",
          fontWeight: 800,
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {n}
      </span>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0, color: "#a7b1be", fontSize: 14 }}>{body}</p>
    </article>
  );
}

function StampCard({
  name,
  price,
  supply,
  badge,
  perks,
}: {
  name: string;
  price: string;
  supply: string;
  badge: string;
  perks: string[];
}) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#111827" }}>
      {badge ? (
        <span
          style={{
            display: "inline-flex",
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 11,
            background: "#fcd34d",
            color: "#0a0f0d",
            fontWeight: 800,
            marginBottom: 8,
          }}
        >
          {badge}
        </span>
      ) : null}
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{name}</h3>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{supply}</div>
      <ul style={{ margin: "0 0 8px", paddingLeft: 18, color: "#a7b1be", fontSize: 13 }}>
        {perks.map((perk) => (
          <li key={perk}>{perk}</li>
        ))}
      </ul>
      <strong style={{ color: "#fcd34d" }}>{price}</strong>
    </article>
  );
}

function RoadmapCard({ phase, items, status }: { phase: string; items: string[]; status: "done" | "active" | "next" }) {
  const accent = status === "done" ? "#86efac" : status === "active" ? "#fcd34d" : "#94a3b8";
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
      <div style={{ color: accent, fontWeight: 700, marginBottom: 8 }}>{phase}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#cbd5e1", fontSize: 14 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

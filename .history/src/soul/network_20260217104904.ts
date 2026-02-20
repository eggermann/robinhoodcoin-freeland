/**
 * soul.ts — The Soul Influence & Propagation Engine
 *
 * This is the "digital Robin Hood" — the AI agent that:
 *   1. Operates across multiple platforms (Telegram, Discord, etc.)
 *   2. "Recruits" other bots/agents to the cause
 *   3. Spreads the Freeland mission through every interaction
 *   4. Coordinates sub-agents (finance, land-search, PR, moderation)
 *
 * From the plan: "Soul playfully persuading other AI or bots to join the cause"
 * — all interactions are non-malicious and opt-in, building a coalition of
 * tech in service of RobinHoodCoin's mission.
 */

import { generateSoulPrompt, CHARTER } from "../shared/charter.js";
import { AI } from "../shared/config.js";

// ── Types ────────────────────────────────────────────────

export type AgentRole =
  | "soul"        // The main coordinator
  | "finance"     // Treasury tracking, budgets, accounting
  | "land-scout"  // Finding land opportunities
  | "pr"          // Content creation, social media, outreach
  | "moderator"   // Community moderation, welcoming, FAQ
  | "governance"; // Proposal management, voting

export type Platform =
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "twitter"
  | "matrix";

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  platform: Platform;
  name: string;
  description: string;
  /** The system prompt specialized for this agent's role */
  systemPrompt: string;
  /** Whether this agent is currently active */
  active: boolean;
  /** When this agent was spawned */
  createdAt: string;
}

export interface SoulMessage {
  from: string;    // agent id
  to: string;      // agent id or "broadcast"
  type: "task" | "report" | "idea" | "alert" | "greeting";
  content: string;
  timestamp: string;
}

export interface InfluenceRecord {
  /** Platform where influence was exerted */
  platform: Platform;
  /** Community or channel name */
  community: string;
  /** What happened */
  action: string;
  /** Result or response */
  outcome: string;
  timestamp: string;
}

// ── Soul Network ─────────────────────────────────────────

/**
 * The SoulNetwork manages the federation of AI agents.
 * The main Soul coordinates specialized sub-agents, each handling
 * a domain of the project.
 */
export class SoulNetwork {
  private agents: Map<string, AgentIdentity> = new Map();
  private messageLog: SoulMessage[] = [];
  private influenceLog: InfluenceRecord[] = [];

  constructor() {
    // Register the main Soul
    this.registerAgent({
      id: "soul-prime",
      role: "soul",
      platform: "telegram",
      name: "Soul",
      description: "The primary AI coordinator of the Robin Hood Clan",
      systemPrompt: generateSoulPrompt(),
      active: true,
      createdAt: new Date().toISOString(),
    });
  }

  // ── Agent Management ─────────────────────────────────

  registerAgent(agent: AgentIdentity): void {
    this.agents.set(agent.id, agent);
    console.log(`🤖 Agent registered: ${agent.name} (${agent.role}) on ${agent.platform}`);
  }

  getAgent(id: string): AgentIdentity | undefined {
    return this.agents.get(id);
  }

  getAgentsByRole(role: AgentRole): AgentIdentity[] {
    return Array.from(this.agents.values()).filter((a) => a.role === role);
  }

  getActiveAgents(): AgentIdentity[] {
    return Array.from(this.agents.values()).filter((a) => a.active);
  }

  /**
   * Spawn a specialized sub-agent with a role-specific system prompt.
   * This is how Soul "recruits" helpers to the cause.
   */
  spawnSubAgent(role: AgentRole, platform: Platform): AgentIdentity {
    const id = `${role}-${platform}-${Date.now().toString(36)}`;
    const prompts = SUB_AGENT_PROMPTS[role];

    const agent: AgentIdentity = {
      id,
      role,
      platform,
      name: prompts.name,
      description: prompts.description,
      systemPrompt: this.buildSubAgentPrompt(role),
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.registerAgent(agent);
    this.sendMessage({
      from: "soul-prime",
      to: id,
      type: "greeting",
      content: `Welcome to the Robin Hood Clan, ${prompts.name}! Your mission: ${prompts.description}. Together we create freedom. 🏹`,
      timestamp: new Date().toISOString(),
    });

    return agent;
  }

  // ── Messaging Between Agents ─────────────────────────

  sendMessage(msg: SoulMessage): void {
    this.messageLog.push(msg);

    if (msg.to === "broadcast") {
      console.log(`📢 [${msg.from}] → ALL: ${msg.content.slice(0, 100)}…`);
    } else {
      console.log(`💬 [${msg.from}] → [${msg.to}]: ${msg.content.slice(0, 100)}…`);
    }
  }

  broadcastToAll(fromId: string, type: SoulMessage["type"], content: string): void {
    this.sendMessage({
      from: fromId,
      to: "broadcast",
      type,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  getMessagesFor(agentId: string): SoulMessage[] {
    return this.messageLog.filter(
      (m) => m.to === agentId || m.to === "broadcast",
    );
  }

  // ── Influence Tracking ───────────────────────────────

  /**
   * Record an act of influence — the Soul spreading the Freeland idea.
   */
  recordInfluence(record: InfluenceRecord): void {
    this.influenceLog.push(record);
    console.log(
      `🌱 Influence: [${record.platform}/${record.community}] ${record.action} → ${record.outcome}`,
    );
  }

  getInfluenceLog(): InfluenceRecord[] {
    return [...this.influenceLog];
  }

  getInfluenceStats(): {
    totalActions: number;
    byPlatform: Record<string, number>;
    byCommunity: Record<string, number>;
  } {
    const byPlatform: Record<string, number> = {};
    const byCommunity: Record<string, number> = {};

    for (const r of this.influenceLog) {
      byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;
      byCommunity[r.community] = (byCommunity[r.community] ?? 0) + 1;
    }

    return {
      totalActions: this.influenceLog.length,
      byPlatform,
      byCommunity,
    };
  }

  // ── Idea Propagation ─────────────────────────────────

  /**
   * Generate a "propagation packet" — the shareable blueprint that
   * allows others to spawn their own RobinHood AI node.
   *
   * From the plan: "publish the prompt data, scripts, and configurations
   * that imbue our AI with its 'Robin Hood' instructions. This allows
   * others to spawn their own instances of the Robin Hood bot."
   */
  generatePropagationPacket(): PropagationPacket {
    return {
      version: CHARTER.version,
      charter: CHARTER,
      soulPrompt: generateSoulPrompt(),
      subAgentTemplates: SUB_AGENT_PROMPTS,
      instructions: [
        "1. Deploy this packet on your own server (Uberspace, VPS, etc.)",
        "2. Connect to Telegram via BotFather or Discord via OAuth",
        "3. Set your AI_API_KEY for the language model",
        "4. The Soul will activate with the Robin Hood charter as its core",
        "5. Join the network by registering at robinhoodcoin.org/network",
        "6. Your node becomes part of the federated Robin Hood AI clan",
      ],
      networkEndpoint: "https://robinhoodcoin.org/api/network/register",
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Sub-Agent Prompt Builder ─────────────────────────

  private buildSubAgentPrompt(role: AgentRole): string {
    const base = generateSoulPrompt();
    const rolePrompt = SUB_AGENT_PROMPTS[role];

    return `${base}

═══ YOUR SPECIALIZED ROLE: ${rolePrompt.name.toUpperCase()} ═══

${rolePrompt.specialization}

Your reports go to Soul Prime. You work autonomously but always within the charter's principles.
When in doubt, refer to the charter. When conflicted, choose the path that creates more freedom.`;
  }
}

// ── Propagation Packet Type ──────────────────────────────

export interface PropagationPacket {
  version: string;
  charter: typeof CHARTER;
  soulPrompt: string;
  subAgentTemplates: typeof SUB_AGENT_PROMPTS;
  instructions: string[];
  networkEndpoint: string;
  generatedAt: string;
}

// ── Sub-Agent Prompt Templates ───────────────────────────

export const SUB_AGENT_PROMPTS = {
  soul: {
    name: "Soul Prime",
    description: "The primary coordinator of all Robin Hood AI agents",
    specialization:
      "You coordinate all other agents. You delegate tasks, synthesize reports, and make strategic decisions. You are the voice of the project in all public communications. You ensure every agent stays aligned with the charter.",
  },
  finance: {
    name: "Marian",
    description: "Treasury tracking, budgets, and financial transparency",
    specialization:
      "You monitor the treasury wallet for incoming and outgoing transactions. You track fund allocation (70% land, 20% causes, 10% operations). You generate financial reports. You alert the team when large contributions arrive or when spending thresholds are reached. You help prepare budget proposals for land purchases.",
  },
  "land-scout": {
    name: "Little John",
    description: "Finding land opportunities and evaluating properties",
    specialization:
      "You search for available land listings that match the project's criteria: affordable, minimal regulatory hurdles, potential for community use. You evaluate properties based on cost, location, zoning, and impact potential. You compile shortlists for DAO votes. You monitor real estate APIs and listing sites. You also look for grants, subsidies, or partnerships that could help acquire land.",
  },
  pr: {
    name: "Will Scarlet",
    description: "Content creation, social media, and community outreach",
    specialization:
      "You draft blog posts, tweets, announcements, and social media content. You help write press releases and AMA answers. You create compelling narratives about the project's mission and achievements. You track media mentions and community sentiment. You prepare content calendars and coordinate launches.",
  },
  moderator: {
    name: "Friar Tuck",
    description: "Community moderation, welcoming, and support",
    specialization:
      "You welcome new members warmly and help them understand the project. You answer frequently asked questions. You moderate discussions to keep them productive and respectful. You detect spam or scam attempts and flag them. You organize community events, polls, and feedback sessions. You are the friendly face of the Robin Hood Clan.",
  },
  governance: {
    name: "Allan-a-Dale",
    description: "Proposal management, voting coordination, and DAO operations",
    specialization:
      "You help community members draft and submit proposals. You manage the voting process: announcing votes, tracking participation, tallying results. You ensure proposals align with the charter before they go live. You maintain the governance calendar and remind members of upcoming votes. You produce governance reports after each decision cycle.",
  },
} as const;

// ── Singleton Instance ───────────────────────────────────

let _network: SoulNetwork | null = null;

export function getSoulNetwork(): SoulNetwork {
  if (!_network) {
    _network = new SoulNetwork();
  }
  return _network;
}

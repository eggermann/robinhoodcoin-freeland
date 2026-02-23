/**
 * community.ts — Community Coordination Features
 *
 * From the plan: "The bot will maintain a to-do list, deadlines, and reminders...
 * moderating, welcoming new members, answering repetitive questions...
 * facilitate votes by gathering input"
 *
 * Provides:
 *   - New member welcome flow
 *   - Reminders and scheduled announcements
 *   - Community polls and informal voting
 *   - Event coordination
 *   - FAQ auto-responder
 */

import fs from "node:fs";
import path from "node:path";

// ── Types ────────────────────────────────────────────────

export interface Reminder {
  id: string;
  message: string;
  /** ISO timestamp for when to fire */
  fireAt: string;
  /** Who set it (Telegram user ID or "system") */
  setBy: string;
  /** Where to send it (chat ID) */
  chatId: string;
  /** Has it been sent? */
  fired: boolean;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string>; // userId -> option
  createdAt: string;
  closesAt: string;
  closed: boolean;
  chatId: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string; // physical or "online"
  rsvps: string[];  // user IDs
  createdAt: string;
}

export interface FAQ {
  question: string;
  keywords: string[];
  answer: string;
}

// ── Data ─────────────────────────────────────────────────

const DATA_DIR = "./data/community";

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Welcome Messages ─────────────────────────────────────

export const WELCOME_MESSAGE = `🏹 *Welcome to the Robin Hood Clan!*

You've just joined a community on a mission to *buy real land* for the people — governed by the people who fund it.

Freeland itself is *strictly non-commercial*: no buying, selling, trade, shops, stores, or business activity inside Freeland zones.

Here's how to get started:

1️⃣ Read our /mission to understand what we're building
2️⃣ Check the /treasury to see our collective funds
3️⃣ Ask me anything — I'm the project's AI assistant

*Quick links:*
🪙 Buy RHC tokens → governance power
🎨 Get a Freeland Stamp NFT → fund a land purchase
🗳️ /proposals → see what's being voted on

_Every member matters. Every coin moves us closer to freedom._ 🌿`;

export function generatePersonalWelcome(username: string): string {
  return `🏹 Welcome, *${username}*!

You're now part of the Robin Hood Clan. Here, we pool resources to buy *real land* for community use.

Inside Freeland zones, commerce is not allowed: no buying, selling, shops, stores, or trade.

Whether you're here to contribute, volunteer, or just learn — you're welcome.

Type /help to see what I can do, or just ask me anything!

_"The forest grows one tree at a time."_ 🌿`;
}

// ── FAQ System ───────────────────────────────────────────

export const FAQS: FAQ[] = [
  {
    question: "What is RobinHoodCoin?",
    keywords: ["what", "robinhoodcoin", "rhc", "coin", "token"],
    answer:
      "RobinHoodCoin (RHC) is a Solana-based governance token for the Freeland Initiative. Holders vote on land purchases, charitable grants, and DAO decisions. It's not about speculation — it's about collective action.",
  },
  {
    question: "What is a Freeland Stamp?",
    keywords: ["stamp", "nft", "freeland stamp"],
    answer:
      "Freeland Stamps are collectible NFTs that directly fund land acquisitions. Each stamp is a badge of contribution — proof that you helped buy land for the commons. They come in tiers: General Supporter, Parcel-specific, and Patron stamps.",
  },
  {
    question: "How are funds used?",
    keywords: ["funds", "money", "treasury", "spend", "allocation"],
    answer:
      "70% of funds go to buying land, 20% to charitable causes, and 10% to operations. All spending requires multisig approval, and large purchases need a full DAO vote. Everything is on-chain and transparent.",
  },
  {
    question: "What is Freeland?",
    keywords: ["freeland", "land", "what is freeland"],
    answer:
      "Freeland is real, physical land purchased by the DAO and designated as a self-governed community commons. It can be used for housing, farming, maker spaces, community centers, or nature conservation — governed by its local community within the charter's principles. Freeland is strictly non-commercial: no buying/selling, trade, shops, stores, business operations, or commercial transactions inside Freeland zones.",
  },
  {
    question: "How do I buy RHC?",
    keywords: ["buy", "get", "purchase", "acquire", "rhc"],
    answer:
      "RHC can be obtained through community grants, earned by contributing (volunteering time or skills), or eventually traded on decentralized exchanges. We prioritize organic community growth over speculation.",
  },
  {
    question: "How do I vote?",
    keywords: ["vote", "voting", "governance", "proposal", "decide"],
    answer:
      "RHC holders can vote on proposals. Use /proposals to see active votes, or /vote to cast yours. Each proposal has a discussion period, followed by a voting window. Majority decides.",
  },
  {
    question: "Is this legal?",
    keywords: ["legal", "law", "regulation", "sec", "security"],
    answer:
      "RobinHoodCoin is designed as a governance/utility token, not a security. Funds are managed through a legal entity (LLC or foundation) that holds land on behalf of the DAO. We follow CityDAO's precedent, which successfully held land through a Wyoming LLC.",
  },
  {
    question: "Who is behind this?",
    keywords: ["team", "who", "behind", "founder", "creators"],
    answer:
      "RobinHoodCoin is a community-driven project. The core team includes developers, community organizers, and legal advisors — but the DAO belongs to all of its members. There's no central owner.",
  },
];

/**
 * Try to match a user's message to an FAQ.
 * Returns the FAQ answer or null if no match.
 */
export function matchFAQ(message: string): string | null {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);

  let bestMatch: FAQ | null = null;
  let bestScore = 0;

  for (const faq of FAQS) {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += keyword.length; // longer keyword matches score higher
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  // Require a minimum match score
  return bestScore >= 4 ? bestMatch?.answer ?? null : null;
}

// ── Reminders ────────────────────────────────────────────

const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");

function loadReminders(): Reminder[] {
  ensureDir();
  if (!fs.existsSync(REMINDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(REMINDERS_FILE, "utf-8")) as Reminder[];
}

function saveReminders(reminders: Reminder[]): void {
  ensureDir();
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

export function createReminder(
  message: string,
  fireAt: string,
  setBy: string,
  chatId: string,
): Reminder {
  const reminder: Reminder = {
    id: `REM-${Date.now().toString(36).toUpperCase()}`,
    message,
    fireAt,
    setBy,
    chatId,
    fired: false,
  };

  const reminders = loadReminders();
  reminders.push(reminder);
  saveReminders(reminders);
  console.log(`⏰ Reminder set: "${message}" at ${fireAt}`);
  return reminder;
}

export function getDueReminders(): Reminder[] {
  const now = new Date().toISOString();
  const reminders = loadReminders();
  return reminders.filter((r) => !r.fired && r.fireAt <= now);
}

export function markReminderFired(id: string): void {
  const reminders = loadReminders();
  const reminder = reminders.find((r) => r.id === id);
  if (reminder) {
    reminder.fired = true;
    saveReminders(reminders);
  }
}

// ── Polls ────────────────────────────────────────────────

const POLLS_FILE = path.join(DATA_DIR, "polls.json");

function loadPolls(): Poll[] {
  ensureDir();
  if (!fs.existsSync(POLLS_FILE)) return [];
  return JSON.parse(fs.readFileSync(POLLS_FILE, "utf-8")) as Poll[];
}

function savePolls(polls: Poll[]): void {
  ensureDir();
  fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2));
}

export function createPoll(
  question: string,
  options: string[],
  chatId: string,
  durationHours: number = 24,
): Poll {
  const poll: Poll = {
    id: `POLL-${Date.now().toString(36).toUpperCase()}`,
    question,
    options,
    votes: {},
    createdAt: new Date().toISOString(),
    closesAt: new Date(Date.now() + durationHours * 3600_000).toISOString(),
    closed: false,
    chatId,
  };

  const polls = loadPolls();
  polls.push(poll);
  savePolls(polls);
  console.log(`📊 Poll created: "${question}" with ${options.length} options`);
  return poll;
}

export function votePoll(pollId: string, userId: string, option: string): Poll {
  const polls = loadPolls();
  const poll = polls.find((p) => p.id === pollId);
  if (!poll) throw new Error(`Poll ${pollId} not found`);
  if (poll.closed) throw new Error(`Poll ${pollId} is closed`);
  if (!poll.options.includes(option)) {
    throw new Error(`Invalid option: "${option}". Options: ${poll.options.join(", ")}`);
  }

  poll.votes[userId] = option;
  savePolls(polls);
  return poll;
}

export function closePoll(pollId: string): { poll: Poll; results: Record<string, number> } {
  const polls = loadPolls();
  const poll = polls.find((p) => p.id === pollId);
  if (!poll) throw new Error(`Poll ${pollId} not found`);

  poll.closed = true;
  savePolls(polls);

  // Tally results
  const results: Record<string, number> = {};
  for (const option of poll.options) {
    results[option] = 0;
  }
  for (const vote of Object.values(poll.votes)) {
    results[vote] = (results[vote] ?? 0) + 1;
  }

  return { poll, results };
}

export function getActivePolls(chatId?: string): Poll[] {
  const polls = loadPolls();
  const now = new Date().toISOString();
  return polls.filter(
    (p) => !p.closed && p.closesAt > now && (!chatId || p.chatId === chatId),
  );
}

// ── Events ───────────────────────────────────────────────

const EVENTS_FILE = path.join(DATA_DIR, "events.json");

function loadEvents(): CommunityEvent[] {
  ensureDir();
  if (!fs.existsSync(EVENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8")) as CommunityEvent[];
}

function saveEvents(events: CommunityEvent[]): void {
  ensureDir();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

export function createEvent(
  title: string,
  description: string,
  date: string,
  location: string,
): CommunityEvent {
  const event: CommunityEvent = {
    id: `EVT-${Date.now().toString(36).toUpperCase()}`,
    title,
    description,
    date,
    location,
    rsvps: [],
    createdAt: new Date().toISOString(),
  };

  const events = loadEvents();
  events.push(event);
  saveEvents(events);
  console.log(`📅 Event created: "${title}" on ${date}`);
  return event;
}

export function rsvpEvent(eventId: string, userId: string): void {
  const events = loadEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) throw new Error(`Event ${eventId} not found`);
  if (!event.rsvps.includes(userId)) {
    event.rsvps.push(userId);
    saveEvents(events);
  }
}

export function getUpcomingEvents(): CommunityEvent[] {
  const now = new Date().toISOString();
  return loadEvents().filter((e) => e.date >= now);
}

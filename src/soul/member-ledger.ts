import fs from "node:fs";
import path from "node:path";
import type { StampTier } from "../nft/stamp-tiers.js";

const DATA_DIR = "./data/community";
const LEDGER_FILE = path.join(DATA_DIR, "member-ledger.json");

const TIER_BONUS: Record<StampTier, number> = {
  genesis: 0.25,
  patron: 0.1,
  parcel: 0.05,
  supporter: 0.02,
};

function emptyHoldings(): MemberStampHoldings {
  return {
    genesis: 0,
    supporter: 0,
    parcel: 0,
    patron: 0,
  };
}

export interface MemberStampHoldings {
  genesis: number;
  supporter: number;
  parcel: number;
  patron: number;
}

export interface MemberVoteRecord {
  proposalId: string;
  direction: "for" | "against";
  votedAt: string;
}

export interface MemberProfile {
  userId: string;
  username?: string;
  displayName?: string;
  joinedAt: string;
  lastActiveAt: string;
  stampHoldings: MemberStampHoldings;
  totalStampMints: number;
  totalContributedSOL: number;
  votesCast: number;
  voteHistory: MemberVoteRecord[];
  governanceWeight: number;
  badges: string[];
}

export interface MemberLedgerStats {
  totalMembers: number;
  active30d: number;
  totalContributedSOL: number;
  totalStampMints: number;
  totalVotesCast: number;
  topContributors: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    contributedSOL: number;
    governanceWeight: number;
  }>;
}

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function computeGovernanceWeight(holdings: MemberStampHoldings): number {
  const raw = 1
    + holdings.genesis * TIER_BONUS.genesis
    + holdings.patron * TIER_BONUS.patron
    + holdings.parcel * TIER_BONUS.parcel
    + holdings.supporter * TIER_BONUS.supporter;

  return Math.round(Math.min(8, raw) * 100) / 100;
}

function normalizeProfile(partial: Partial<MemberProfile> & { userId: string }): MemberProfile {
  const now = new Date().toISOString();
  const stampHoldings = {
    ...emptyHoldings(),
    ...(partial.stampHoldings ?? {}),
  };

  const voteHistory = Array.isArray(partial.voteHistory)
    ? partial.voteHistory
      .filter((vote): vote is MemberVoteRecord => (
        typeof vote?.proposalId === "string"
        && (vote?.direction === "for" || vote?.direction === "against")
        && typeof vote?.votedAt === "string"
      ))
      .slice(-500)
    : [];

  return {
    userId: partial.userId,
    username: typeof partial.username === "string" ? partial.username : undefined,
    displayName: typeof partial.displayName === "string" ? partial.displayName : undefined,
    joinedAt: typeof partial.joinedAt === "string" ? partial.joinedAt : now,
    lastActiveAt: typeof partial.lastActiveAt === "string" ? partial.lastActiveAt : now,
    stampHoldings,
    totalStampMints: typeof partial.totalStampMints === "number" ? partial.totalStampMints : 0,
    totalContributedSOL: typeof partial.totalContributedSOL === "number" ? partial.totalContributedSOL : 0,
    votesCast: typeof partial.votesCast === "number" ? partial.votesCast : voteHistory.length,
    voteHistory,
    governanceWeight: typeof partial.governanceWeight === "number"
      ? partial.governanceWeight
      : computeGovernanceWeight(stampHoldings),
    badges: Array.isArray(partial.badges)
      ? partial.badges.filter((badge): badge is string => typeof badge === "string").slice(0, 30)
      : [],
  };
}

function loadProfiles(): MemberProfile[] {
  ensureDir();
  if (!fs.existsSync(LEDGER_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(LEDGER_FILE, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is { userId: string } & Partial<MemberProfile> => (
        typeof item === "object"
        && item !== null
        && typeof (item as { userId?: unknown }).userId === "string"
      ))
      .map((item) => normalizeProfile(item));
  } catch {
    return [];
  }
}

function saveProfiles(profiles: MemberProfile[]): void {
  ensureDir();
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(profiles, null, 2), "utf-8");
}

function withProfiles(mutator: (profiles: MemberProfile[]) => MemberProfile): MemberProfile {
  const profiles = loadProfiles();
  const result = mutator(profiles);
  saveProfiles(profiles);
  return result;
}

function addBadge(profile: MemberProfile, badge: string): void {
  if (!profile.badges.includes(badge)) {
    profile.badges.push(badge);
  }
}

function updateDerivedFields(profile: MemberProfile): void {
  profile.governanceWeight = computeGovernanceWeight(profile.stampHoldings);

  if (profile.totalStampMints >= 1) addBadge(profile, "stamp-supporter");
  if (profile.stampHoldings.parcel >= 1) addBadge(profile, "parcel-backer");
  if (profile.stampHoldings.patron >= 1) addBadge(profile, "patron");
  if (profile.stampHoldings.genesis >= 1) addBadge(profile, "genesis");
  if (profile.votesCast >= 1) addBadge(profile, "voter");
  if (profile.votesCast >= 10) addBadge(profile, "active-governor");
  if (profile.totalContributedSOL >= 10) addBadge(profile, "major-supporter");
}

export function ensureMember(
  userId: string,
  meta?: { username?: string; displayName?: string },
): MemberProfile {
  return withProfiles((profiles) => {
    const now = new Date().toISOString();
    let profile = profiles.find((item) => item.userId === userId);

    if (!profile) {
      profile = normalizeProfile({
        userId,
        username: meta?.username,
        displayName: meta?.displayName,
        joinedAt: now,
        lastActiveAt: now,
      });
      profiles.push(profile);
      addBadge(profile, "member");
      updateDerivedFields(profile);
      return profile;
    }

    if (meta?.username) profile.username = meta.username;
    if (meta?.displayName) profile.displayName = meta.displayName;
    profile.lastActiveAt = now;
    updateDerivedFields(profile);
    return profile;
  });
}

export function touchMemberActivity(
  userId: string,
  meta?: { username?: string; displayName?: string },
): MemberProfile {
  return ensureMember(userId, meta);
}

export function recordStampMintForMember(input: {
  userId: string;
  campaignId: string;
  tier: StampTier;
  quantity: number;
  priceSOL: number;
  username?: string;
  displayName?: string;
}): MemberProfile {
  const qty = Math.max(1, Math.floor(input.quantity));
  const amount = Math.max(0, input.priceSOL) * qty;

  return withProfiles((profiles) => {
    let profile = profiles.find((item) => item.userId === input.userId);
    if (!profile) {
      profile = normalizeProfile({
        userId: input.userId,
        username: input.username,
        displayName: input.displayName,
      });
      profiles.push(profile);
      addBadge(profile, "member");
    }

    profile.lastActiveAt = new Date().toISOString();
    if (input.username) profile.username = input.username;
    if (input.displayName) profile.displayName = input.displayName;

    profile.stampHoldings[input.tier] += qty;
    profile.totalStampMints += qty;
    profile.totalContributedSOL = Math.round((profile.totalContributedSOL + amount) * 10000) / 10000;

    if (input.tier === "parcel") {
      addBadge(profile, `parcel:${input.campaignId}`);
    }

    updateDerivedFields(profile);
    return profile;
  });
}

export function recordGovernanceVoteForMember(input: {
  userId: string;
  proposalId: string;
  direction: "for" | "against";
  username?: string;
  displayName?: string;
}): MemberProfile {
  return withProfiles((profiles) => {
    let profile = profiles.find((item) => item.userId === input.userId);
    if (!profile) {
      profile = normalizeProfile({
        userId: input.userId,
        username: input.username,
        displayName: input.displayName,
      });
      profiles.push(profile);
      addBadge(profile, "member");
    }

    if (input.username) profile.username = input.username;
    if (input.displayName) profile.displayName = input.displayName;
    profile.lastActiveAt = new Date().toISOString();

    const existingVote = profile.voteHistory.find((vote) => vote.proposalId === input.proposalId);
    if (existingVote) {
      existingVote.direction = input.direction;
      existingVote.votedAt = new Date().toISOString();
    } else {
      profile.voteHistory.push({
        proposalId: input.proposalId,
        direction: input.direction,
        votedAt: new Date().toISOString(),
      });
      profile.votesCast += 1;
    }

    profile.voteHistory = profile.voteHistory.slice(-500);
    updateDerivedFields(profile);
    return profile;
  });
}

export function getMemberProfile(userId: string): MemberProfile | null {
  const found = loadProfiles().find((profile) => profile.userId === userId);
  return found ?? null;
}

export function listMemberProfiles(): MemberProfile[] {
  return loadProfiles();
}

export function getMemberLedgerStats(): MemberLedgerStats {
  const profiles = loadProfiles();
  const cutoff = Date.now() - 30 * 24 * 3600_000;

  const totalContributedSOL = profiles
    .reduce((sum, profile) => sum + profile.totalContributedSOL, 0);
  const totalStampMints = profiles
    .reduce((sum, profile) => sum + profile.totalStampMints, 0);
  const totalVotesCast = profiles
    .reduce((sum, profile) => sum + profile.votesCast, 0);

  const topContributors = [...profiles]
    .sort((a, b) => b.totalContributedSOL - a.totalContributedSOL)
    .slice(0, 8)
    .map((profile) => ({
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      contributedSOL: profile.totalContributedSOL,
      governanceWeight: profile.governanceWeight,
    }));

  return {
    totalMembers: profiles.length,
    active30d: profiles.filter((profile) => new Date(profile.lastActiveAt).getTime() >= cutoff).length,
    totalContributedSOL: Math.round(totalContributedSOL * 10000) / 10000,
    totalStampMints,
    totalVotesCast,
    topContributors,
  };
}

export function formatMemberProfile(profile: MemberProfile): string {
  return [
    `Member: ${profile.displayName ?? profile.username ?? profile.userId}`,
    `User ID: ${profile.userId}`,
    `Governance weight: ${profile.governanceWeight}`,
    `Contribution: ${profile.totalContributedSOL.toFixed(4)} SOL`,
    `Stamps: supporter ${profile.stampHoldings.supporter}, parcel ${profile.stampHoldings.parcel}, patron ${profile.stampHoldings.patron}, genesis ${profile.stampHoldings.genesis}`,
    `Votes cast: ${profile.votesCast}`,
    `Badges: ${profile.badges.join(", ") || "none"}`,
  ].join("\n");
}

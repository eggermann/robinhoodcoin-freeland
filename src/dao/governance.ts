/**
 * governance.ts — DAO governance utilities for RobinHoodCoin.
 *
 * This module provides helpers for creating proposals and voting
 * using the Squads multisig as the execution layer.
 *
 * Governance flow:
 *   1. Any RHC holder can submit a proposal (off-chain or on-chain)
 *   2. The community votes (token-weighted or 1-holder-1-vote)
 *   3. If approved, multisig signers execute the transaction
 *
 * For v1, we use a simple off-chain proposal + on-chain multisig execution model.
 * Future versions may integrate SPL Governance or Realms.
 */

import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

// ── Types ────────────────────────────────────────────────

export type ProposalStatus =
  | "draft"
  | "active"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled";

export type ProposalType =
  | "land_purchase"
  | "grant"
  | "parameter_change"
  | "general";

export interface ProposalVoteRecord {
  voterId: string;
  direction: "for" | "against";
  votedAt: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  type: ProposalType;
  status: ProposalStatus;
  createdAt: string;
  closesAt: string;
  proposer: string; // public key
  votesFor: number;
  votesAgainst: number;
  voteRecords: ProposalVoteRecord[];
  /** On-chain transaction to execute if approved */
  executionTx?: string;
  /** For land_purchase: target details */
  landDetails?: {
    selectedLandId?: string;
    location: string;
    sizeAcres: number;
    priceSOL: number;
    description: string;
    stampCampaignId?: string;
  };
}

// ── Proposal Store (file-based for v1) ───────────────────

const PROPOSALS_DIR = "./data/proposals";

function ensureDir(): void {
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
}

function normalizeProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    voteRecords: Array.isArray(proposal.voteRecords)
      ? proposal.voteRecords.filter((record): record is ProposalVoteRecord => (
        typeof record?.voterId === "string"
        && (record?.direction === "for" || record?.direction === "against")
        && typeof record?.votedAt === "string"
      ))
      : [],
  };
}

export function createProposal(
  proposal: Omit<Proposal, "id" | "status" | "createdAt" | "votesFor" | "votesAgainst" | "voteRecords">,
): Proposal {
  ensureDir();

  const id = `PROP-${Date.now().toString(36).toUpperCase()}`;
  const full: Proposal = {
    ...proposal,
    id,
    status: "draft",
    createdAt: new Date().toISOString(),
    votesFor: 0,
    votesAgainst: 0,
    voteRecords: [],
  };

  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(full, null, 2));
  console.log(`📋 Proposal created: ${id} — "${full.title}"`);
  return full;
}

export function getProposal(id: string): Proposal | null {
  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return normalizeProposal(JSON.parse(fs.readFileSync(filePath, "utf-8")) as Proposal);
}

export function updateProposal(
  id: string,
  updates: Partial<Omit<Proposal, "id" | "createdAt">>,
): Proposal {
  const proposal = getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);

  const next: Proposal = {
    ...normalizeProposal(proposal),
    ...updates,
    landDetails: updates.landDetails
      ? {
        ...(proposal.landDetails ?? {}),
        ...updates.landDetails,
      }
      : proposal.landDetails,
  };

  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function deleteProposal(id: string): void {
  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function listProposals(status?: ProposalStatus): Proposal[] {
  ensureDir();
  const files = fs.readdirSync(PROPOSALS_DIR).filter((f) => f.endsWith(".json"));
  const proposals = files.map((f) => {
    const raw = fs.readFileSync(path.join(PROPOSALS_DIR, f), "utf-8");
    return normalizeProposal(JSON.parse(raw) as Proposal);
  });

  if (status) return proposals.filter((p) => p.status === status);
  return proposals.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function vote(
  proposalId: string,
  direction: "for" | "against",
  voterId: string,
): Proposal {
  const proposal = getProposal(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
  if (proposal.status !== "active") {
    throw new Error(`Proposal ${proposalId} is not active (status: ${proposal.status})`);
  }
  if (proposal.closesAt && Date.parse(proposal.closesAt) < Date.now()) {
    throw new Error(`Proposal ${proposalId} already closed at ${proposal.closesAt}`);
  }
  if (proposal.voteRecords.some((record) => record.voterId === voterId)) {
    throw new Error(`Voter ${voterId} already voted on proposal ${proposalId}`);
  }

  if (direction === "for") {
    proposal.votesFor++;
  } else {
    proposal.votesAgainst++;
  }
  proposal.voteRecords.push({
    voterId,
    direction,
    votedAt: new Date().toISOString(),
  });

  const filePath = path.join(PROPOSALS_DIR, `${proposalId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
  return proposal;
}

export function activateProposal(id: string, closesAt: string): Proposal {
  const proposal = getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  proposal.status = "active";
  proposal.closesAt = closesAt;

  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
  console.log(`🗳️ Proposal ${id} is now ACTIVE — voting closes ${closesAt}`);
  return proposal;
}

export function finalizeProposal(id: string): Proposal {
  const proposal = getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);

  if (proposal.votesFor > proposal.votesAgainst) {
    proposal.status = "approved";
    console.log(`✅ Proposal ${id} APPROVED (${proposal.votesFor} for, ${proposal.votesAgainst} against)`);
  } else {
    proposal.status = "rejected";
    console.log(`❌ Proposal ${id} REJECTED (${proposal.votesFor} for, ${proposal.votesAgainst} against)`);
  }

  const filePath = path.join(PROPOSALS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2));
  return proposal;
}

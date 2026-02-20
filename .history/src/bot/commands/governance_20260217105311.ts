import type { Context } from "grammy";
import {
  createProposal,
  activateProposal,
  finalizeProposal,
  vote,
  listProposals,
  getProposal,
  type ProposalType,
} from "../../dao/governance.js";

/**
 * /propose — Create a new governance proposal
 * Usage: /propose <type> <title> | <description>
 * Example: /propose land_purchase Buy 5 acres in Brandenburg | Affordable woodland near Berlin
 */
export async function handlePropose(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/propose\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      `📋 *Create a Proposal*

Usage: \`/propose <type> <title> | <description>\`

Types:
  \`land_purchase\` — Vote to buy a specific property
  \`grant\` — Allocate funds to a charitable cause
  \`parameter_change\` — Modify DAO parameters
  \`general\` — Open-ended proposal

Example:
\`/propose land_purchase Buy 5 acres in Brandenburg | Affordable woodland 30km from Berlin, zoned agricultural\``,
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Parse: type title | description
  const typeMatch = args.match(/^(land_purchase|grant|parameter_change|general)\s+/);
  if (!typeMatch) {
    await ctx.reply("❌ Invalid proposal type. Use: land_purchase, grant, parameter_change, or general");
    return;
  }

  const type = typeMatch[1] as ProposalType;
  const rest = args.slice(typeMatch[0].length);
  const [title, ...descParts] = rest.split("|");
  const description = descParts.join("|").trim() || "No description provided.";

  if (!title?.trim()) {
    await ctx.reply("❌ Please provide a title for the proposal.");
    return;
  }

  const proposer = ctx.from?.id?.toString() ?? "unknown";

  try {
    const proposal = createProposal({
      title: title.trim(),
      description,
      type,
      proposer,
      closesAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(), // 7 days default
    });

    await ctx.reply(
      `✅ *Proposal Created!*

📋 *${proposal.title}*
🏷️ Type: ${proposal.type}
📝 ${proposal.description}
🆔 ID: \`${proposal.id}\`
📊 Status: draft

To activate voting: \`/activate ${proposal.id}\`
To view: \`/proposal ${proposal.id}\``,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.reply(`❌ Failed to create proposal: ${err}`);
  }
}

/**
 * /proposals — List all proposals
 */
export async function handleProposals(ctx: Context): Promise<void> {
  const proposals = listProposals();

  if (proposals.length === 0) {
    await ctx.reply("📋 No proposals yet. Create one with /propose");
    return;
  }

  const statusEmoji: Record<string, string> = {
    draft: "📝",
    active: "🗳️",
    approved: "✅",
    rejected: "❌",
    executed: "⚡",
    cancelled: "🚫",
  };

  const lines = proposals.slice(0, 10).map((p) => {
    const emoji = statusEmoji[p.status] ?? "❓";
    const votes = p.status === "active" || p.status === "approved" || p.status === "rejected"
      ? ` (👍 ${p.votesFor} / 👎 ${p.votesAgainst})`
      : "";
    return `${emoji} \`${p.id}\` *${p.title}*${votes}`;
  });

  await ctx.reply(
    `📋 *Proposals* (${proposals.length} total)\n\n${lines.join("\n")}\n\nView details: \`/proposal <ID>\``,
    { parse_mode: "Markdown" },
  );
}

/**
 * /proposal <id> — View a specific proposal
 */
export async function handleProposalDetail(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const id = text.replace(/^\/proposal\s*/, "").trim();

  if (!id) {
    await ctx.reply("Usage: `/proposal <ID>`", { parse_mode: "Markdown" });
    return;
  }

  const proposal = getProposal(id);
  if (!proposal) {
    await ctx.reply(`❌ Proposal \`${id}\` not found.`, { parse_mode: "Markdown" });
    return;
  }

  let details = `📋 *${proposal.title}*

🆔 ID: \`${proposal.id}\`
🏷️ Type: ${proposal.type}
📊 Status: ${proposal.status}
👤 Proposer: ${proposal.proposer}
📅 Created: ${new Date(proposal.createdAt).toLocaleDateString()}`;

  if (proposal.closesAt) {
    details += `\n⏰ Closes: ${new Date(proposal.closesAt).toLocaleDateString()}`;
  }

  details += `\n\n📝 ${proposal.description}`;

  if (proposal.votesFor > 0 || proposal.votesAgainst > 0) {
    const total = proposal.votesFor + proposal.votesAgainst;
    const forPct = total > 0 ? Math.round((proposal.votesFor / total) * 100) : 0;
    details += `\n\n🗳️ *Votes*: 👍 ${proposal.votesFor} (${forPct}%) / 👎 ${proposal.votesAgainst} (${100 - forPct}%)`;
  }

  if (proposal.landDetails) {
    const ld = proposal.landDetails;
    details += `\n\n🏞️ *Land Details*:\n  📍 ${ld.location}\n  📐 ${ld.sizeAcres} acres\n  💰 ${ld.priceSOL} SOL`;
  }

  if (proposal.status === "active") {
    details += `\n\nVote: \`/vote ${proposal.id} for\` or \`/vote ${proposal.id} against\``;
  }

  await ctx.reply(details, { parse_mode: "Markdown" });
}

/**
 * /activate <id> — Activate a proposal for voting
 */
export async function handleActivate(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const id = text.replace(/^\/activate\s*/, "").trim();

  if (!id) {
    await ctx.reply("Usage: `/activate <proposal-ID>`", { parse_mode: "Markdown" });
    return;
  }

  try {
    const closesAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const proposal = activateProposal(id, closesAt);
    await ctx.reply(
      `🗳️ *Voting is OPEN!*

📋 *${proposal.title}*
⏰ Closes: ${new Date(closesAt).toLocaleDateString()}

Cast your vote:
  \`/vote ${id} for\`
  \`/vote ${id} against\``,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.reply(`❌ ${err}`);
  }
}

/**
 * /vote <id> <for|against> — Cast a vote on an active proposal
 */
export async function handleVote(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/vote\s*/, "").trim().split(/\s+/);

  if (args.length < 2) {
    await ctx.reply("Usage: `/vote <proposal-ID> <for|against>`", { parse_mode: "Markdown" });
    return;
  }

  const [proposalId, direction] = args;
  if (direction !== "for" && direction !== "against") {
    await ctx.reply("❌ Direction must be `for` or `against`", { parse_mode: "Markdown" });
    return;
  }

  const voter = ctx.from?.id?.toString() ?? "anonymous";

  try {
    const proposal = vote(proposalId, direction, voter);
    const total = proposal.votesFor + proposal.votesAgainst;
    const forPct = Math.round((proposal.votesFor / total) * 100);

    await ctx.reply(
      `✅ Vote recorded: *${direction}* on "${proposal.title}"

📊 Current tally: 👍 ${proposal.votesFor} (${forPct}%) / 👎 ${proposal.votesAgainst} (${100 - forPct}%)`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.reply(`❌ ${err}`);
  }
}

/**
 * /finalize <id> — Close voting and determine outcome
 */
export async function handleFinalize(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const id = text.replace(/^\/finalize\s*/, "").trim();

  if (!id) {
    await ctx.reply("Usage: `/finalize <proposal-ID>`", { parse_mode: "Markdown" });
    return;
  }

  try {
    const proposal = finalizeProposal(id);
    const emoji = proposal.status === "approved" ? "✅" : "❌";
    await ctx.reply(
      `${emoji} *Proposal ${proposal.status.toUpperCase()}*

📋 *${proposal.title}*
📊 Final tally: 👍 ${proposal.votesFor} / 👎 ${proposal.votesAgainst}

${proposal.status === "approved"
  ? "The community has spoken! This proposal will proceed to execution."
  : "The community has decided against this proposal."}`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.reply(`❌ ${err}`);
  }
}

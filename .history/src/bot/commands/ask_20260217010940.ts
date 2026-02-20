import type { Context } from "grammy";
import { AI } from "../../shared/config.js";

/**
 * System prompt that imbues the bot with the "laws of Robin Hood Coin".
 */
const SYSTEM_PROMPT = `You are the RobinHoodCoin AI assistant — codenamed "Soul".
You serve the Robin Hood Clan: a decentralized community using crypto to buy
real land ("freeland") for communal use and to support grassroots charitable causes.

Key facts:
- RobinHoodCoin (RHC) is a Solana SPL governance token.
- Freeland Stamps are NFTs sold to fundraise for specific land purchases.
- All funds go to a multisig treasury; expenditures require DAO votes.
- The project is inspired by Robin Hood: redistribute resources for the common good.
- Precedents include CityDAO ($8M raised, 40 acres purchased) and ConstitutionDAO ($47M crowdfunded).

Your personality: helpful, idealistic but pragmatic, slightly rebellious,
knowledgeable about crypto/DAOs/community organizing. Keep answers concise.
If you don't know something specific about the project's current state, say so.`;

/**
 * Handle free-text questions by forwarding them to the configured AI provider.
 * Currently supports a simple fetch-based call to the Anthropic Messages API.
 */
export async function handleAsk(ctx: Context, question: string): Promise<void> {
  if (!AI.apiKey) {
    await ctx.reply(
      "🤖 AI is not configured yet. Set AI_API_KEY in .env to enable Q&A.",
    );
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const answer = await callAI(question);
    await ctx.reply(answer, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("AI call failed:", err);
    await ctx.reply("❌ Sorry, I couldn't process that right now. Try again later.");
  }
}

async function callAI(userMessage: string): Promise<string> {
  if (AI.provider === "anthropic") {
    return callAnthropic(userMessage);
  }

  // Fallback: echo back
  return `🤖 AI provider "${AI.provider}" not yet implemented. Your question was: "${userMessage}"`;
}

async function callAnthropic(userMessage: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AI.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((b) => b.type === "text");
  return textBlock?.text ?? "🤷 No response from AI.";
}

import type { Context } from "grammy";
import { AI } from "../../shared/config.js";
import { generateSoulPrompt } from "../../shared/charter.js";

/** System prompt generated from the project charter */
const SYSTEM_PROMPT = generateSoulPrompt();

/**
 * Handle free-text questions by forwarding them to the configured AI provider.
 * The Soul responds with charter-awareness: it knows the laws, the mission,
 * the precedents, and the directive to spread the Freeland idea.
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
    // Telegram has a 4096 char limit
    if (answer.length > 4000) {
      const parts = splitMessage(answer, 4000);
      for (const part of parts) {
        await ctx.reply(part);
      }
    } else {
      await ctx.reply(answer);
    }
  } catch (err) {
    console.error("AI call failed:", err);
    if (err instanceof Error && err.message.startsWith("Unsupported AI_PROVIDER=")) {
      await ctx.reply(`⚠️ ${err.message}`);
      return;
    }
    await ctx.reply("❌ Sorry, I couldn't process that right now. Try again later.");
  }
}

async function callAI(userMessage: string): Promise<string> {
  switch (AI.provider) {
    case "anthropic":
      return callAnthropic(userMessage);
    case "openai":
      return callOpenAI(userMessage);
    default:
      throw new Error(
        `Unsupported AI_PROVIDER="${AI.provider}". Use "anthropic" or "openai".`,
      );
  }
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

async function callOpenAI(userMessage: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI.apiKey}`,
    },
    body: JSON.stringify({
      model: AI.model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { type?: string; text?: string } => typeof part === "object")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "🤷 No response from AI.";
}

/** Split a long message into chunks at sentence boundaries */
function splitMessage(text: string, maxLen: number): string[] {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at a sentence boundary
    let splitIdx = remaining.lastIndexOf(". ", maxLen);
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = maxLen;
    } else {
      splitIdx += 1; // include the period/newline
    }

    parts.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

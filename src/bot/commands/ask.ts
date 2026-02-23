import type { Context } from "grammy";
import { AI, OPENCLAW } from "../../shared/config.js";
import { generateSoulPrompt } from "../../shared/charter.js";
import { queryPropertyOracle } from "../../soul/skills/property-oracle.js";
import { getTreasuryBalanceSnapshot } from "../../soul/skills/treasury-tracker.js";

const MAX_MODEL_TOOL_LOOPS = 3;

export interface AskMemoryScope {
  userId: string;
  chatId: string;
  chatType: string;
}

export interface AskMemoryContext {
  staticFacts: string[];
  dynamicFacts: string[];
  relatedMemories: Array<{
    text: string;
    similarity?: number;
    updatedAt?: string;
  }>;
}

export interface AskMemoryRetrieveInput {
  query: string;
  scope: AskMemoryScope;
}

export interface AskMemoryCaptureInput {
  query: string;
  answer: string;
  scope: AskMemoryScope;
}

export type AskMemoryRetrieveFn = (
  input: AskMemoryRetrieveInput,
) => Promise<AskMemoryContext | null>;

export type AskMemoryCaptureFn = (
  input: AskMemoryCaptureInput,
) => Promise<void>;

let memoryRetrieveFn: AskMemoryRetrieveFn | null = null;
let memoryCaptureFn: AskMemoryCaptureFn | null = null;

export function configureAskMemory(opts: {
  retrieve: AskMemoryRetrieveFn;
  capture?: AskMemoryCaptureFn;
} | null): void {
  memoryRetrieveFn = opts?.retrieve ?? null;
  memoryCaptureFn = opts?.capture ?? null;
}

interface SkillResult {
  tool: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | Array<{ type?: string; text?: string }>;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: OpenAIMessage;
  }>;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | { type: string; [key: string]: unknown };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<AnthropicContentBlock | AnthropicToolResultBlock>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

const OPENAI_TOOLS: Array<Record<string, unknown>> = [
  {
    type: "function",
    function: {
      name: "property_oracle",
      description:
        "Return the current RobinHoodCoin land shortlist from the LandSearchManager.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Optional keyword filter for region, zoning, or property name.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "treasury_tracker",
      description:
        "Fetch the live SOL treasury balance for TREASURY_MULTISIG_ADDRESS.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          address: {
            type: "string",
            description: "Optional treasury address override.",
          },
        },
      },
    },
  },
];

const ANTHROPIC_TOOLS: Array<Record<string, unknown>> = [
  {
    name: "property_oracle",
    description:
      "Return the current RobinHoodCoin land shortlist from the LandSearchManager.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Optional keyword filter for region, zoning, or property name.",
        },
      },
    },
  },
  {
    name: "treasury_tracker",
    description:
      "Fetch the live SOL treasury balance for TREASURY_MULTISIG_ADDRESS.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        address: {
          type: "string",
          description: "Optional treasury address override.",
        },
      },
    },
  },
];

/**
 * Handle free-text questions by forwarding them to the configured AI provider.
 * The Soul responds with charter-awareness and tool-driven context.
 */
export async function handleAsk(ctx: Context, question: string): Promise<void> {
  const configError = getProviderConfigError();
  if (configError) {
    await ctx.reply(configError);
    return;
  }

  await ctx.replyWithChatAction("typing");

  const scope = getMemoryScope(ctx);
  const memory = await recallMemorySafe(question, scope);

  try {
    const answer = await callAI(question, memory, scope);
    await captureMemorySafe({ query: question, answer, scope });

    // Telegram has a 4096 char limit
    if (answer.length > 4000) {
      const parts = splitMessage(answer, 4000);
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "Markdown" });
      }
    } else {
      await ctx.reply(answer, { parse_mode: "Markdown" });
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

function getMemoryScope(ctx: Context): AskMemoryScope {
  return {
    userId: String(ctx.from?.id ?? "unknown-user"),
    chatId: String(ctx.chat?.id ?? "unknown-chat"),
    chatType: ctx.chat?.type ?? "unknown-chat-type",
  };
}

async function recallMemorySafe(
  query: string,
  scope: AskMemoryScope,
): Promise<AskMemoryContext | null> {
  if (!memoryRetrieveFn) return null;

  try {
    return await memoryRetrieveFn({ query, scope });
  } catch (err) {
    console.error("Memory recall failed:", err);
    return null;
  }
}

async function captureMemorySafe(input: AskMemoryCaptureInput): Promise<void> {
  if (!memoryCaptureFn) return;

  try {
    await memoryCaptureFn(input);
  } catch (err) {
    console.error("Memory capture failed:", err);
  }
}

async function callAI(
  userMessage: string,
  memoryContext: AskMemoryContext | null,
  scope: AskMemoryScope,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(memoryContext);

  switch (AI.provider) {
    case "anthropic":
      return callAnthropic(userMessage, systemPrompt);
    case "openai":
      return callOpenAI(userMessage, systemPrompt);
    case "openclaw":
      return callOpenClaw(userMessage, systemPrompt, scope);
    default:
      throw new Error(
        `Unsupported AI_PROVIDER="${AI.provider}". Use "anthropic", "openai", or "openclaw".`,
      );
  }
}

function getProviderConfigError(): string | null {
  if (AI.provider === "openai" || AI.provider === "anthropic") {
    return AI.apiKey
      ? null
      : "🤖 AI is not configured yet. Set AI_API_KEY in .env to enable Q&A.";
  }

  if (AI.provider === "openclaw") {
    return OPENCLAW.gatewayUrl.trim()
      ? null
      : "🤖 OpenClaw is not configured yet. Set OPENCLAW_GATEWAY_URL in .env.";
  }

  return `⚠️ Unsupported AI_PROVIDER="${AI.provider}". Use "anthropic", "openai", or "openclaw".`;
}

function buildSystemPrompt(memoryContext: AskMemoryContext | null): string {
  const basePrompt = generateSoulPrompt();
  const toolsPrompt = `
═══ AVAILABLE RUNTIME TOOLS ═══

Use these tools when needed to answer factual project-state questions:

1) property_oracle
- Reads the current shortlist from LandSearchManager.
- Use when asked about land options, current properties, shortlist status, or parcel comparisons.

2) treasury_tracker
- Reads live treasury SOL balance from TREASURY_MULTISIG_ADDRESS.
- Use when asked about available funds, budget feasibility, or treasury status.

Tool usage rules:
- Prefer tools over guessing current treasury or shortlist state.
- Use concrete numbers from tool outputs.
- If tool output reports missing configuration or errors, state that clearly.
`;

  const memoryPrompt = formatMemoryContext(memoryContext);
  return [basePrompt, toolsPrompt, memoryPrompt].filter(Boolean).join("\n\n");
}

function formatMemoryContext(memoryContext: AskMemoryContext | null): string {
  if (!memoryContext) return "";

  const staticFacts = memoryContext.staticFacts.slice(0, 8);
  const dynamicFacts = memoryContext.dynamicFacts.slice(0, 8);
  const related = memoryContext.relatedMemories.slice(0, 8);

  const sections: string[] = [];

  if (staticFacts.length > 0) {
    sections.push(
      "## Persistent Profile\n" +
        staticFacts.map((fact) => `- ${fact}`).join("\n"),
    );
  }

  if (dynamicFacts.length > 0) {
    sections.push(
      "## Recent Context\n" +
        dynamicFacts.map((fact) => `- ${fact}`).join("\n"),
    );
  }

  if (related.length > 0) {
    sections.push(
      "## Retrieved Memory Matches\n" +
        related
          .map((item) => {
            const score = typeof item.similarity === "number"
              ? ` (${Math.round(item.similarity * 100)}% relevance)`
              : "";
            return `- ${item.text}${score}`;
          })
          .join("\n"),
    );
  }

  if (sections.length === 0) return "";

  return [
    "<memory-context>",
    ...sections,
    "Use this only when relevant to the current user request.",
    "</memory-context>",
  ].join("\n");
}

async function runSkillTool(
  name: string,
  input: Record<string, unknown>,
): Promise<SkillResult> {
  try {
    if (name === "property_oracle") {
      const query = typeof input.query === "string" ? input.query : undefined;
      return {
        tool: name,
        ok: true,
        data: queryPropertyOracle(query),
      };
    }

    if (name === "treasury_tracker") {
      const address = typeof input.address === "string" ? input.address : undefined;
      return {
        tool: name,
        ok: true,
        data: await getTreasuryBalanceSnapshot(address),
      };
    }

    return {
      tool: name,
      ok: false,
      error: `Unknown tool: ${name}`,
    };
  } catch (err) {
    return {
      tool: name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function extractOpenAIContent(
  content: OpenAIMessage["content"],
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((part): part is { type?: string; text?: string } => typeof part === "object")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function isAnthropicTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === "text" && typeof (block as AnthropicTextBlock).text === "string";
}

function isAnthropicToolUseBlock(
  block: AnthropicContentBlock,
): block is AnthropicToolUseBlock {
  const candidate = block as Partial<AnthropicToolUseBlock>;
  return block.type === "tool_use"
    && typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.input === "object"
    && candidate.input !== null;
}

async function callAnthropic(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  const messages: AnthropicMessage[] = [{ role: "user", content: userMessage }];

  for (let round = 0; round < MAX_MODEL_TOOL_LOOPS; round++) {
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
        system: systemPrompt,
        messages,
        tools: ANTHROPIC_TOOLS,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const blocks = data.content ?? [];
    const text = blocks
      .filter(isAnthropicTextBlock)
      .map((block) => block.text)
      .join("\n")
      .trim();

    const toolUses = blocks.filter(isAnthropicToolUseBlock);
    if (toolUses.length === 0) {
      return text || "🤷 No response from AI.";
    }

    messages.push({ role: "assistant", content: blocks });

    const toolResults: AnthropicToolResultBlock[] = [];
    for (const toolUse of toolUses) {
      const result = await runSkillTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "🤷 I couldn't complete tool-assisted reasoning in time. Please try again.";
}

async function callOpenAI(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  const messages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < MAX_MODEL_TOOL_LOOPS; round++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI.apiKey}`,
      },
      body: JSON.stringify({
        model: AI.model,
        max_tokens: 1024,
        messages,
        tools: OPENAI_TOOLS,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const assistant = data.choices?.[0]?.message;

    if (!assistant) {
      return "🤷 No response from AI.";
    }

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = extractOpenAIContent(assistant.content);
      return text || "🤷 No response from AI.";
    }

    messages.push({
      role: "assistant",
      content: extractOpenAIContent(assistant.content),
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const args = parseJsonObject(toolCall.function.arguments ?? "{}");
      const result = await runSkillTool(toolCall.function.name, args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "🤷 I couldn't complete tool-assisted reasoning in time. Please try again.";
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildOpenClawChatCompletionsUrl(): string {
  const base = OPENCLAW.gatewayUrl.endsWith("/")
    ? OPENCLAW.gatewayUrl
    : `${OPENCLAW.gatewayUrl}/`;
  const path = OPENCLAW.chatCompletionsPath.startsWith("/")
    ? OPENCLAW.chatCompletionsPath.slice(1)
    : OPENCLAW.chatCompletionsPath;

  return new URL(path, base).toString();
}

function buildOpenClawRuntimeHint(property: SkillResult, treasury: SkillResult): string {
  return [
    "<runtime-state>",
    `property_oracle: ${toJson(property)}`,
    `treasury_tracker: ${toJson(treasury)}`,
    "This runtime-state snapshot was generated by local bot skills right before this reply.",
    "Use it as the latest factual state when answering availability/budget/property questions.",
    "</runtime-state>",
  ].join("\n");
}

function buildOpenClawHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (OPENCLAW.bearerToken) {
    headers.Authorization = `Bearer ${OPENCLAW.bearerToken}`;
  }
  if (OPENCLAW.agentId) {
    headers["x-openclaw-agent-id"] = OPENCLAW.agentId;
  }

  return headers;
}

async function callOpenClaw(
  userMessage: string,
  systemPrompt: string,
  scope: AskMemoryScope,
): Promise<string> {
  const [propertyState, treasuryState] = await Promise.all([
    runSkillTool("property_oracle", {}),
    runSkillTool("treasury_tracker", {}),
  ]);

  const promptWithRuntimeState = [
    systemPrompt,
    buildOpenClawRuntimeHint(propertyState, treasuryState),
  ].join("\n\n");

  const url = buildOpenClawChatCompletionsUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildOpenClawHeaders(),
      body: JSON.stringify({
        model: OPENCLAW.model || AI.model || "openclaw",
        max_tokens: 1024,
        messages: [
          { role: "system", content: promptWithRuntimeState },
          { role: "user", content: userMessage },
        ],
        user: `telegram:${scope.chatId}:${scope.userId}`,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        throw new Error(
          `OpenClaw gateway error 404 at ${url}. Enable chat completions endpoint in OpenClaw gateway config.`,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `OpenClaw gateway auth error ${res.status}. Set OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_PASSWORD in .env if gateway auth is enabled.`,
        );
      }
      throw new Error(`OpenClaw gateway error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const assistant = data.choices?.[0]?.message;
    if (!assistant) return "🤷 No response from AI.";

    const text = extractOpenAIContent(assistant.content);
    return text || "🤷 No response from AI.";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `OpenClaw gateway timeout after ${OPENCLAW.timeoutMs}ms (OPENCLAW_TIMEOUT_MS).`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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

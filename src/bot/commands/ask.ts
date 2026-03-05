import type { Context } from "grammy";
import { AI, AI_RUNTIME, NVIDIA, OPENCLAW } from "../../shared/config.js";
import {
  applyRuntimeModelSwitchEffects,
  autoSwitchRuntimeModel,
  getOpenClawModelOverrideForRuntime,
  getRuntimeModelAttemptOrder,
  getRuntimeModelLabel,
  getRuntimeModelStatus,
} from "../ai-runtime.js";
import { generateSoulPrompt } from "../../shared/charter.js";
import { queryLandResearchOracle } from "../../soul/skills/land-research-oracle.js";
import { queryPropertyOracle } from "../../soul/skills/property-oracle.js";
import { getTreasuryBalanceSnapshot } from "../../soul/skills/treasury-tracker.js";
import { replyPlain } from "../telegram-reply.js";
import { logAskFailure } from "../ask-failure-log.js";
import { logUrlProbe, type UrlProbeRecord } from "../url-probe-log.js";

const MAX_MODEL_TOOL_LOOPS = 3;
const URL_PROBE_TIMEOUT_MS = 12_000;
const URL_STATUS_HINT_RE =
  /\b(alive|up|down|work|working|happen|happening|status|reachable|online|offline|responding|not really|not realy|geht|laeuft|läuft)\b/i;

type UrlProbeResult = UrlProbeRecord["result"];

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

type OpenClawRole = "soul" | "finance" | "land-scout" | "pr" | "moderator" | "governance";

interface OpenClawRoute {
  role: OpenClawRole;
  agentId: string;
  reason: string;
}

interface OpenClawRuntimeContext {
  route: OpenClawRoute;
  promptWithRuntimeState: string;
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
  {
    type: "function",
    function: {
      name: "land_research_oracle",
      description:
        "Return the latest scouting opportunities and shortlist matches discovered by Little John.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Optional keyword filter for opportunities and listings.",
          },
          type: {
            type: "string",
            enum: ["grant", "auction", "sponsorship"],
            description: "Optional opportunity type filter.",
          },
          limit: {
            type: "number",
            description: "Optional max number of items per category.",
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
  {
    name: "land_research_oracle",
    description:
      "Return the latest scouting opportunities and shortlist matches discovered by Little John.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Optional keyword filter for opportunities and listings.",
        },
        type: {
          type: "string",
          enum: ["grant", "auction", "sponsorship"],
          description: "Optional opportunity type filter.",
        },
        limit: {
          type: "number",
          description: "Optional max number of items per category.",
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

  const scope = getMemoryScope(ctx);

  const url = extractFirstUrl(question);
  if (url && shouldHandleAsUrlProbe(question, url)) {
    await ctx.replyWithChatAction("typing");
    const result = await probeUrl(url);
    logUrlProbe({ question, url, scope, result });
    await replyPlain(ctx, formatUrlProbeReport(url, result));
    return;
  }

  await ctx.replyWithChatAction("typing");

  const memory = await recallMemorySafe(question, scope);

  try {
    const answer = await callAI(question, memory, scope);
    await captureMemorySafe({ query: question, answer, scope });

    await replyPlain(ctx, answer);
  } catch (err) {
    const failureId = logAskFailure({
      question,
      scope,
      provider: AI.provider,
      timeoutMs: AI.provider === "openclaw" ? OPENCLAW.timeoutMs : undefined,
      runtimeStatus: AI.provider === "openclaw" ? getRuntimeModelStatus() : undefined,
      error: err,
    });

    console.error(`AI call failed [${failureId}]:`, err);
    if (err instanceof Error && err.message.startsWith("Unsupported AI_PROVIDER=")) {
      await ctx.reply(`⚠️ ${err.message}`);
      return;
    }

    const isTimeout = err instanceof Error && /timeout/i.test(err.message);
    if (isTimeout) {
      await ctx.reply(`❌ Gateway timeout while processing the request. Please retry shortly. Ref: ${failureId}`);
      return;
    }

    await ctx.reply(`❌ Sorry, I couldn't process that right now. Try again later. Ref: ${failureId}`);
  }
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return null;
  return match[0].replace(/[.,!?]+$/, "");
}

function shouldHandleAsUrlProbe(question: string, url: string): boolean {
  const withoutUrl = question.replace(url, " ").trim();
  if (!withoutUrl) return true;

  const tokenCount = withoutUrl.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 14 && URL_STATUS_HINT_RE.test(withoutUrl)) return true;

  return false;
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim() || null;
}

function formatUrlProbeReport(url: string, result: UrlProbeResult): string {
  const lines = [
    "🌐 URL check",
    `URL: ${url}`,
  ];

  if (result.finalUrl) lines.push(`Final URL: ${result.finalUrl}`);

  if (typeof result.status === "number") {
    lines.push(`HTTP: ${result.status} ${result.ok ? "OK" : "ERROR"}`);
  }

  if (result.contentType) lines.push(`Content-Type: ${result.contentType}`);
  if (result.title) lines.push(`Title: ${result.title}`);

  if (result.error) {
    lines.push(`Result: ${result.error}`);
  } else if (result.ok === false) {
    lines.push("Server responded, but with a non-2xx status.");
  }

  return lines.join("\n");
}

async function probeUrl(url: string): Promise<UrlProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Keep this lightweight and widely accepted by basic WAFs.
        "User-Agent": "Mozilla/5.0 (compatible; RobinHoodCoinBot/1.0; +https://freeland.rocks)",
      },
    });

    const result: UrlProbeResult = {
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
    };
    const contentType = response.headers.get("content-type");
    if (contentType) {
      result.contentType = contentType;
    }

    if ((contentType ?? "").includes("text/html")) {
      const html = await response.text();
      const title = extractHtmlTitle(html.slice(0, 200_000));
      if (title) result.title = title;
    }

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        error: `timeout after ${URL_PROBE_TIMEOUT_MS}ms`,
        timeoutMs: URL_PROBE_TIMEOUT_MS,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `request failed (${message})`,
    };
  } finally {
    clearTimeout(timeout);
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
      return callOpenClawWithFallback(userMessage, systemPrompt, scope);
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
	    const status = getRuntimeModelStatus();
	    const hasEnabledModel = status.available.some((model) => model.enabled);
	    if (hasEnabledModel) return null;

	    const reasons = status.available
	      .map((model) => `${model.id}: ${model.reasonDisabled ?? "not configured"}`)
	      .join(" | ");
	    return `🤖 OpenClaw runtime has no available model. Configure OPENCLAW_GATEWAY_URL (and optionally NVIDIA_FALLBACK_ENABLED). (${reasons})`;
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

3) land_research_oracle
- Reads Little John's tracked opportunities (grants/auctions/sponsorship) and shortlist matches.
- Use when asked about research, land scouting pipeline, or next acquisition leads.

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

    if (name === "land_research_oracle") {
      const query = typeof input.query === "string" ? input.query : undefined;
      const type = typeof input.type === "string" ? input.type : undefined;
      const limit = typeof input.limit === "number" ? input.limit : undefined;
      return {
        tool: name,
        ok: true,
        data: queryLandResearchOracle({ query, type, limit }),
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

function buildOpenClawRuntimeHint(
  property: SkillResult,
  treasury: SkillResult,
  research: SkillResult,
): string {
  return [
    "<runtime-state>",
    `property_oracle: ${toJson(property)}`,
    `treasury_tracker: ${toJson(treasury)}`,
    `land_research_oracle: ${toJson(research)}`,
    "This runtime-state snapshot was generated by local bot skills right before this reply.",
    "Use it as the latest factual state when answering availability/budget/property questions.",
    "</runtime-state>",
  ].join("\n");
}

function buildOpenClawHeaders(route: OpenClawRoute): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (OPENCLAW.bearerToken) {
    headers.Authorization = `Bearer ${OPENCLAW.bearerToken}`;
  }

  headers["x-openclaw-agent-id"] = route.agentId;
  headers["x-openclaw-agent-role"] = route.role;

  return headers;
}

function countHits(text: string, keywords: string[]): number {
  return keywords.reduce((hits, keyword) => hits + (text.includes(keyword) ? 1 : 0), 0);
}

function routeToOpenClawAgent(userMessage: string): OpenClawRoute {
  const defaultRoute: OpenClawRoute = {
    role: "soul",
    agentId: OPENCLAW.agents.soul,
    reason: "default coordinator route",
  };

  if (!OPENCLAW.enableRoleRouting) return defaultRoute;

  const normalized = userMessage.toLowerCase();
  const scores: Record<OpenClawRole, number> = {
    soul: 0,
    finance: countHits(normalized, [
      "treasury",
      "balance",
      "sol",
      "budget",
      "fund",
      "funds",
      "money",
      "cost",
      "afford",
      "price",
    ]),
    "land-scout": countHits(normalized, [
      "land",
      "parcel",
      "property",
      "plot",
      "acre",
      "acres",
      "zoning",
      "listing",
      "shortlist",
      "real estate",
    ]),
    governance: countHits(normalized, [
      "proposal",
      "proposals",
      "vote",
      "voting",
      "governance",
      "approve",
      "approved",
      "reject",
      "rejected",
      "activate",
      "finalize",
    ]),
    pr: countHits(normalized, [
      "tweet",
      "twitter",
      "x post",
      "announcement",
      "press",
      "blog",
      "copy",
      "outreach",
      "marketing",
    ]),
    moderator: countHits(normalized, [
      "welcome",
      "moderate",
      "moderation",
      "spam",
      "faq",
      "rule",
      "rules",
      "community guideline",
    ]),
  };

  const ranked = (Object.entries(scores) as Array<[OpenClawRole, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [bestRole, bestScore] = ranked[0];
  if (bestScore <= 0) return defaultRoute;

  const agentMap: Record<OpenClawRole, string> = {
    soul: OPENCLAW.agents.soul,
    finance: OPENCLAW.agents.finance,
    "land-scout": OPENCLAW.agents.landScout,
    pr: OPENCLAW.agents.pr,
    moderator: OPENCLAW.agents.moderator,
    governance: OPENCLAW.agents.governance,
  };

  return {
    role: bestRole,
    agentId: agentMap[bestRole] || OPENCLAW.agents.soul,
    reason: `matched ${bestScore} role keywords`,
  };
}

function buildOpenClawRoutingHint(route: OpenClawRoute): string {
  return [
    "<openclaw-routing>",
    `routed_role: ${route.role}`,
    `routed_agent_id: ${route.agentId}`,
    `routing_reason: ${route.reason}`,
    "You are currently executing as this specialized role. Stay aligned with that role's responsibilities.",
    "</openclaw-routing>",
  ].join("\n");
}

function buildNvidiaChatCompletionsUrl(): string {
  const base = NVIDIA.baseUrl.endsWith("/")
    ? NVIDIA.baseUrl
    : `${NVIDIA.baseUrl}/`;
  return new URL("chat/completions", base).toString();
}

async function buildOpenClawRuntimeContext(
  userMessage: string,
  systemPrompt: string,
): Promise<OpenClawRuntimeContext> {
  const route = routeToOpenClawAgent(userMessage);
  if (OPENCLAW.debugRouting) {
    console.log(
      `[openclaw-routing] role=${route.role} agent=${route.agentId} reason="${route.reason}"`,
    );
  }
  const [propertyState, treasuryState, landResearchState] = await Promise.all([
    runSkillTool("property_oracle", {}),
    runSkillTool("treasury_tracker", {}),
    runSkillTool("land_research_oracle", { query: userMessage, limit: 5 }),
  ]);

  const promptWithRuntimeState = [
    systemPrompt,
    buildOpenClawRoutingHint(route),
    buildOpenClawRuntimeHint(propertyState, treasuryState, landResearchState),
  ].join("\n\n");

  return {
    route,
    promptWithRuntimeState,
  };
}

async function callOpenClawGateway(
  userMessage: string,
  scope: AskMemoryScope,
  runtimeContext: OpenClawRuntimeContext,
  modelOverride?: string | null,
): Promise<string> {
  const url = buildOpenClawChatCompletionsUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  try {
    const model = (modelOverride ?? "").trim()
      || OPENCLAW.model
      || AI.model
      || "openclaw";
    const res = await fetch(url, {
      method: "POST",
      headers: buildOpenClawHeaders(runtimeContext.route),
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: runtimeContext.promptWithRuntimeState },
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

async function callNvidiaKimi(
  userMessage: string,
  scope: AskMemoryScope,
  runtimeContext: OpenClawRuntimeContext,
): Promise<string> {
  const url = buildNvidiaChatCompletionsUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: NVIDIA.model,
      max_tokens: NVIDIA.maxTokens,
      temperature: NVIDIA.temperature,
      top_p: NVIDIA.topP,
      stream: false,
      messages: [
        { role: "system", content: runtimeContext.promptWithRuntimeState },
        { role: "user", content: userMessage },
      ],
      user: `telegram:${scope.chatId}:${scope.userId}`,
    };

    if (NVIDIA.thinking) {
      body.chat_template_kwargs = { thinking: true };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const responseBody = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `NVIDIA auth error ${res.status}. Check NVIDIA_API_KEY in .env.`,
        );
      }
      throw new Error(`NVIDIA Kimi error ${res.status}: ${responseBody}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const assistant = data.choices?.[0]?.message;
    if (!assistant) return "🤷 No response from AI.";

    const text = extractOpenAIContent(assistant.content);
    return text || "🤷 No response from AI.";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `NVIDIA Kimi timeout after ${OPENCLAW.timeoutMs}ms. Increase OPENCLAW_TIMEOUT_MS if needed.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenClawWithFallback(
  userMessage: string,
  systemPrompt: string,
  scope: AskMemoryScope,
): Promise<string> {
  const attemptOrder = getRuntimeModelAttemptOrder();
  if (attemptOrder.length === 0) {
    const status = getRuntimeModelStatus();
    const reason = status.available
      .map((model) => `${model.id}: ${model.reasonDisabled ?? "not configured"}`)
      .join(" | ");
    throw new Error(`No enabled runtime models are available. ${reason}`);
  }

  const runtimeContext = await buildOpenClawRuntimeContext(userMessage, systemPrompt);
  const errors: string[] = [];

  for (let idx = 0; idx < attemptOrder.length; idx += 1) {
    const modelId = attemptOrder[idx];
    const label = getRuntimeModelLabel(modelId);

    try {
      const modelOverride = getOpenClawModelOverrideForRuntime(modelId);
      const answer = await callOpenClawGateway(
        userMessage,
        scope,
        runtimeContext,
        modelOverride,
      );

      const switched = idx > 0 && autoSwitchRuntimeModel(modelId);
      let switchNote = "";
      if (switched) {
        const effects = await applyRuntimeModelSwitchEffects(modelId, "auto");
        if (!effects.persisted && effects.persistError) {
          console.error("Auto-switch persist failed:", effects.persistError);
        }
        if (effects.restartReason) {
          console.log(`[ai-runtime] ${effects.restartReason}`);
        }
        if (effects.restartScheduled) {
          switchNote = `\n\n♻️ Runtime restart scheduled (${effects.restartReason ?? "configured command"}).`;
        }
      }

      if (idx > 0 && AI_RUNTIME.fallbackNote) {
        const mode = switched ? "auto-switched" : "temporary fallback";
        return `⚠️ Fallback model: *${label}* (${mode}).\n\n${answer}${switchNote}`;
      }

      return answer;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${message}`);
    }
  }

  throw new Error(`All runtime models failed. ${errors.join(" | ")}`);
}

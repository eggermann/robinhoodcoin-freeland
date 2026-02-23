import type { Context, SessionFlavor } from "grammy";

export interface SessionData {
  messageCount: number;
  lastActive: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

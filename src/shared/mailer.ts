import nodemailer, {
  type SentMessageInfo,
  type Transporter,
} from "nodemailer";
import { SMTP } from "./config.js";

export interface MailPayload {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

let transporter: Transporter | null = null;

function missingSmtpConfigFields(): string[] {
  const missing: string[] = [];
  if (!SMTP.host.trim()) missing.push("SMTP_HOST");
  if (!Number.isFinite(SMTP.port) || SMTP.port <= 0) missing.push("SMTP_PORT");
  if (!SMTP.user.trim()) missing.push("SMTP_USER");
  if (!SMTP.pass.trim()) missing.push("SMTP_PASS");
  if (!SMTP.from.trim()) missing.push("SMTP_FROM");
  return missing;
}

function assertSmtpConfig(): void {
  const missing = missingSmtpConfigFields();
  if (missing.length === 0) return;
  throw new Error(`Missing SMTP configuration: ${missing.join(", ")}`);
}

function getTransporter(): Transporter {
  assertSmtpConfig();

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      requireTLS: !SMTP.secure,
      auth: {
        user: SMTP.user,
        pass: SMTP.pass,
      },
    });
  }

  return transporter;
}

export async function verifyMailer(): Promise<void> {
  await getTransporter().verify();
}

export async function sendMail(payload: MailPayload): Promise<SentMessageInfo> {
  if (!payload.text && !payload.html) {
    throw new Error("Mail payload must include text or html content.");
  }

  const info = await getTransporter().sendMail({
    from: payload.from ?? SMTP.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    replyTo: payload.replyTo,
  });

  return info;
}

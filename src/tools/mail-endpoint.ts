import http from "node:http";
import { sendMail, verifyMailer } from "../shared/mailer.js";

interface NotifyMailRequest {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

const host = process.env.MAIL_NOTIFY_HOST ?? "127.0.0.1";
const portRaw = Number(process.env.MAIL_NOTIFY_PORT ?? "8787");
const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 8787;
const token = (process.env.MAIL_NOTIFY_TOKEN ?? "").trim();
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(
  res: http.ServerResponse<http.IncomingMessage>,
  status: number,
  payload: Record<string, unknown>,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseBearerToken(rawAuthHeader: string | undefined): string {
  if (!rawAuthHeader) return "";
  const [scheme, value] = rawAuthHeader.split(" ");
  if (!scheme || !value) return "";
  if (scheme.toLowerCase() !== "bearer") return "";
  return value.trim();
}

function readBody(
  req: http.IncomingMessage,
  limitBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error(`Request body too large (max ${limitBytes} bytes).`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

function parseNotifyRequest(raw: string): NotifyMailRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = parsed as Partial<NotifyMailRequest>;
  if (!candidate.to) throw new Error("Missing field: to");
  if (!candidate.subject || candidate.subject.trim().length === 0) {
    throw new Error("Missing field: subject");
  }
  if (!candidate.text && !candidate.html) {
    throw new Error("At least one of text or html is required.");
  }

  return {
    to: candidate.to,
    subject: candidate.subject,
    text: candidate.text,
    html: candidate.html,
    from: candidate.from,
    replyTo: candidate.replyTo,
  };
}

async function main(): Promise<void> {
  if (!token) {
    throw new Error("MAIL_NOTIFY_TOKEN is required for the internal mail endpoint.");
  }

  await verifyMailer();

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: "Invalid request." });
      return;
    }

    if (req.method === "GET" && req.url === "/healthz") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method !== "POST" || req.url !== "/internal/notify/mail") {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    const requestToken = parseBearerToken(req.headers.authorization);
    if (requestToken !== token) {
      sendJson(res, 401, { error: "Unauthorized." });
      return;
    }

    let body: NotifyMailRequest;
    try {
      const rawBody = await readBody(req, MAX_BODY_BYTES);
      body = parseNotifyRequest(rawBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: message });
      return;
    }

    try {
      const info = await sendMail(body);
      sendJson(res, 200, {
        ok: true,
        messageId: info.messageId,
        accepted: (info as { accepted?: string[] }).accepted ?? [],
        rejected: (info as { rejected?: string[] }).rejected ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 502, { error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`📨 Internal mail endpoint listening on http://${host}:${port}`);
    console.log("   POST /internal/notify/mail");
    console.log("   GET  /healthz");
  });
}

main().catch((err) => {
  console.error("❌ Failed to start internal mail endpoint:", err);
  process.exit(1);
});

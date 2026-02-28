import { SMTP } from "../shared/config.js";
import { sendMail, verifyMailer } from "../shared/mailer.js";

interface CliOptions {
  to: string;
  subject?: string;
  text?: string;
  from?: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run test:mail -- --to you@example.com [--subject \"...\"] [--text \"...\"] [--from \"Display <from@example.com>\"]",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${arg}`);
    }

    switch (arg) {
      case "--to":
        options.to = value;
        break;
      case "--subject":
        options.subject = value;
        break;
      case "--text":
        options.text = value;
        break;
      case "--from":
        options.from = value;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }

    index += 1;
  }

  if (!options.to?.trim()) {
    throw new Error("The --to argument is required.");
  }

  return {
    to: options.to,
    subject: options.subject,
    text: options.text,
    from: options.from,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString();

  await verifyMailer();

  const info = await sendMail({
    to: options.to,
    from: options.from,
    subject: options.subject ?? `[RobinHoodCoin] SMTP test ${timestamp}`,
    text:
      options.text
      ?? [
        "SMTP test from RobinHoodCoin.",
        `Generated at: ${timestamp}`,
        `SMTP host: ${SMTP.host}:${SMTP.port}`,
      ].join("\n"),
  });

  console.log("✅ Test email sent");
  console.log(`   Message ID: ${info.messageId}`);

  const accepted = Array.isArray((info as { accepted?: unknown[] }).accepted)
    ? ((info as { accepted?: string[] }).accepted ?? [])
    : [];
  const rejected = Array.isArray((info as { rejected?: unknown[] }).rejected)
    ? ((info as { rejected?: string[] }).rejected ?? [])
    : [];

  if (accepted.length > 0) {
    console.log(`   Accepted: ${accepted.join(", ")}`);
  }
  if (rejected.length > 0) {
    console.log(`   Rejected: ${rejected.join(", ")}`);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ test:mail failed: ${message}`);
  console.error(usage());
  process.exit(1);
});

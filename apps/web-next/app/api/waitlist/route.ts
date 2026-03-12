import { NextResponse } from "next/server";
import { addWaitlistEntry } from "../../../lib/waitlist";

interface WaitlistPayload {
  email?: unknown;
  name?: unknown;
  interest?: unknown;
  source?: unknown;
}

export async function POST(req: Request) {
  let payload: WaitlistPayload;

  try {
    payload = await req.json() as WaitlistPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await addWaitlistEntry({
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : undefined,
      interest: typeof payload.interest === "string" ? payload.interest : undefined,
      source: typeof payload.source === "string" ? payload.source : "homepage",
    });

    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        total: result.total,
        message: result.duplicate
          ? "That email is already on the waitlist."
          : "You are on the waitlist.",
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save waitlist entry.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db";
import { isDatabaseUnavailableError } from "../../../../../lib/db-errors";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const comments = await db.parcelComment.findMany({
      where: { parcelId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ total: comments.length, comments });
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    console.error(`Parcel comments GET unavailable for ${id}.`, error);
    return NextResponse.json(
      { total: 0, comments: [], degraded: true, error: "Parcel database temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const author = String(body.author ?? "Anonymous").slice(0, 80);
  const text = String(body.body ?? "").trim();

  if (!text) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  try {
    const created = await db.parcelComment.create({
      data: {
        parcelId: id,
        author,
        body: text.slice(0, 1500),
      },
    });

    return NextResponse.json({ ok: true, comment: created }, { status: 201 });
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    console.error(`Parcel comments POST unavailable for ${id}.`, error);
    return NextResponse.json({ error: "Parcel database temporarily unavailable" }, { status: 503 });
  }
}

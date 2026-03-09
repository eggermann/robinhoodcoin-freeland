import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { isDatabaseUnavailableError } from "../../../lib/db-errors";

export async function GET() {
  try {
    const items = await db.parcel.findMany({
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json({ total: items.length, items });
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    console.error("Parcel API unavailable.", error);
    return NextResponse.json(
      { total: 0, items: [], degraded: true, error: "Parcel database temporarily unavailable" },
      { status: 503 },
    );
  }
}

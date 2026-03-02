import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET() {
  const items = await db.parcel.findMany({
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ total: items.length, items });
}

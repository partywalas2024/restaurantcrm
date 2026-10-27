// Reads an uploaded bank/UPI statement into candidate expense rows for review.
// Owner-only. Nothing is saved here — /api/statement/import does that after a
// person has ticked, categorised and explained each row.

import { NextRequest, NextResponse } from "next/server";
import { apiRestaurantGuard } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { annotateRows, parseStatementCsv, type StatementRow } from "@/lib/statement";
import { extractStatementFromFile } from "@/lib/openai-statement";

export const maxDuration = 300;

const MAX_BYTES = 32 * 1024 * 1024;
const AI_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

export async function POST(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;
  if (user.role !== "RESTAURANT_ADMIN") {
    return NextResponse.json({ error: "Only the owner can import a statement." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 32 MB.` }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  const isCsv = file.type === "text/csv" || file.type === "text/plain" || name.endsWith(".csv");

  try {
    let rows: StatementRow[];
    let creditsSkipped = 0;
    let source: "csv" | "ai";

    if (isCsv) {
      const parsed = parseStatementCsv(await file.text());
      rows = parsed.rows;
      creditsSkipped = parsed.creditsSkipped;
      source = "csv";
    } else if (AI_TYPES.includes(file.type)) {
      const limit = rateLimit("statement", user.id, 15, 60 * 60 * 1000);
      if (!limit.allowed) {
        return NextResponse.json({ error: `Too many statement reads this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` }, { status: 429 });
      }
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "Reading PDF/photo statements needs OPENAI_API_KEY on the server. A CSV export from your bank works without it." }, { status: 501 });
      }
      rows = await extractStatementFromFile(file);
      source = "ai";
    } else {
      return NextResponse.json({ error: `Unsupported file type "${file.type || name.split(".").pop()}". Upload a CSV, a PDF, or a photo of the statement.` }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No debit (money-out) transactions could be read from that file." }, { status: 422 });
    }
    if (rows.length > 1000) {
      return NextResponse.json({ error: `That statement has ${rows.length} debits — import it in smaller date ranges (max 1000 at a time).` }, { status: 413 });
    }

    const annotated = await annotateRows(user.restaurantId, rows);
    return NextResponse.json({ rows: annotated, fileName: file.name, source, creditsSkipped });
  } catch (err) {
    console.error("Statement parse failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read that statement." }, { status: 422 });
  }
}

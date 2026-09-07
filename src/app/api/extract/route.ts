// Bill extraction endpoint for the Upload Bills page.
//
// Accepts a PDF or photo, hands it to OpenAI (see lib/openai-extract.ts) and
// returns structured bills for the user to review. Nothing is written to the
// database here — saving happens separately via /api/import, so the extraction
// is always confirmed by a human first.

import { NextRequest, NextResponse } from "next/server";
import { apiAuthGuard, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_FILE_BYTES,
  SUPPORTED_TYPES,
  extractBillsFromFile,
} from "@/lib/openai-extract";

export const maxDuration = 300;

// Generous enough for a real session of uploading a month of bills, low
// enough that a runaway loop can't quietly spend a fortune at OpenAI.
const EXTRACT_LIMIT = 30;
const EXTRACT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const denied = await apiAuthGuard();
  if (denied) return denied;

  // Every call here costs money, so it is metered per user.
  const user = await getCurrentUser();
  const limit = rateLimit("extract", user?.id ?? "anonymous", EXTRACT_LIMIT, EXTRACT_WINDOW_MS);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `You've read ${EXTRACT_LIMIT} files in the last hour — the limit that protects against runaway API cost. Try again in ${minutes} minute(s).` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to your .env file (get one at platform.openai.com/api-keys) to enable automatic bill extraction.",
      },
      { status: 501 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (!SUPPORTED_TYPES[file.type]) {
    return NextResponse.json(
      {
        error: `Unsupported file type "${file.type || "unknown"}". Upload a PDF or a photo (JPEG, PNG, WebP) of the bills.`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB. Split the PDF and upload it in parts.`,
      },
      { status: 413 },
    );
  }

  try {
    const result = await extractBillsFromFile(file);

    if (result.bills.length === 0) {
      return NextResponse.json(
        { error: "No bills could be read from that file. Check that the pages are legible and try again." },
        { status: 422 },
      );
    }

    return NextResponse.json({ result, fileName: file.name });
  } catch (err) {
    console.error("Bill extraction failed:", err);

    const message = err instanceof Error ? err.message : "Extraction failed.";
    // Surface the model-name case explicitly — it's the most likely
    // misconfiguration and the fix (setting OPENAI_MODEL) isn't obvious.
    const isModelError = /model/i.test(message) && /(not found|does not exist|not have access)/i.test(message);

    return NextResponse.json(
      {
        error: isModelError
          ? `${message} — set OPENAI_MODEL in .env to a model your account can use.`
          : message,
      },
      { status: 502 },
    );
  }
}

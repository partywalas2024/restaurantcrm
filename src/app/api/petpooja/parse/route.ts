// Reads one or more PetPooja report exports (Orders Master / Executive
// Summary / Day End Summary, any mix) and returns the merged per-day figures
// for review. Nothing is written to the database here — saving happens
// separately via /api/petpooja/import, after a human has reviewed the merge.

import { NextRequest, NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/auth";
import { parsePetPoojaFile, mergeDayInputs, type ParsedDayInput } from "@/lib/petpooja-import";

const MAX_FILES = 20;

export async function POST(req: NextRequest) {
  const denied = await apiAuthGuard();
  if (denied) return denied;

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at once.` }, { status: 400 });
  }

  const allInputs: ParsedDayInput[] = [];
  const fileErrors: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      const result = await parsePetPoojaFile(file);
      if ("error" in result) {
        fileErrors.push({ fileName: file.name, error: result.error });
      } else {
        allInputs.push(...result.inputs);
      }
    } catch (err) {
      fileErrors.push({ fileName: file.name, error: err instanceof Error ? err.message : "Could not read this file." });
    }
  }

  if (allInputs.length === 0) {
    return NextResponse.json(
      { error: "None of the uploaded files could be read.", fileErrors },
      { status: 422 },
    );
  }

  const days = mergeDayInputs(allInputs);
  return NextResponse.json({ days, fileErrors });
}

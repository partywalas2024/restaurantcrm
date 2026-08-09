// First half of the PetPooja import: parses the uploaded CSV/XLSX, guesses
// which column means what, and returns headers plus a preview so the user can
// correct the mapping before anything is saved.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { guessMapping } from "@/lib/sales-import";
import { apiAuthGuard } from "@/lib/auth";

const MAX_ROWS = 20000;

export async function POST(req: NextRequest) {
  const denied = await apiAuthGuard();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const name = file.name.toLowerCase();
  let headers: string[] = [];
  let rows: Record<string, string>[] = [];

  try {
    if (name.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      headers = parsed.meta.fields ?? [];
      rows = parsed.data;
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = wb.worksheets[0];
      if (!sheet) return NextResponse.json({ error: "No sheets found in the workbook." }, { status: 400 });

      const headerRow = sheet.getRow(1);
      headers = (headerRow.values as unknown[]).slice(1).map((v) => String(v ?? "").trim());

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = (row.values as unknown[]).slice(1);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          const cell = values[i];
          obj[h] = cell === undefined || cell === null ? "" : String(cell);
        });
        if (Object.values(obj).some((v) => v !== "")) rows.push(obj);
      });
    } else {
      return NextResponse.json({ error: "Please upload a .csv, .xlsx, or .xls file." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not parse file." }, { status: 400 });
  }

  const truncated = rows.length > MAX_ROWS;
  if (truncated) rows = rows.slice(0, MAX_ROWS);

  return NextResponse.json({
    headers,
    rows,
    guessedMapping: guessMapping(headers),
    truncated,
    totalRows: rows.length,
  });
}

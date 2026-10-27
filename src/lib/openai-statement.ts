// Reads a bank / UPI statement PDF or photo into debit transactions using
// OpenAI — same approach and safeguards as the bill reader in
// openai-extract.ts (Files API for PDFs, uploaded copy deleted afterwards,
// Structured Outputs so the shape can't drift). Only money OUT is requested.

import "server-only";

import OpenAI, { toFile } from "openai";
import { parseStatementDate, type StatementRow } from "@/lib/statement";

const DEFAULT_MODEL = "gpt-5.5";

const PROMPT = `This file is a bank, UPI or card statement for a restaurant. Extract ONLY the debit / withdrawal / money-out transactions.

For each debit return:
- date as YYYY-MM-DD (Indian statements are DD/MM/YYYY — convert accordingly)
- description: the narration/particulars exactly as printed (merchant, UPI id, payee)
- amount: the debit amount as a positive number
- reference: the cheque number / UTR / transaction id if printed, otherwise null

Rules:
- Ignore credits, deposits, opening/closing balances, running balances, interest credits and totals.
- Transcribe exactly; never estimate or invent a transaction. If a digit is unreadable use your best reading of what is visible.
- Include every debit on every page.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["transactions"],
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "amount", "reference"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          description: { type: "string" },
          amount: { type: "number" },
          reference: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export async function extractStatementFromFile(file: File): Promise<StatementRow[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const isPdf = file.type === "application/pdf";
  let uploadedFileId: string | null = null;

  try {
    let content;
    if (isPdf) {
      const uploaded = await client.files.create({
        file: await toFile(file, file.name || "statement.pdf", { type: "application/pdf" }),
        purpose: "user_data",
      });
      uploadedFileId = uploaded.id;
      content = { type: "input_file" as const, file_id: uploaded.id };
    } else {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      content = { type: "input_image" as const, image_url: `data:${file.type};base64,${base64}`, detail: "high" as const };
    }

    const response = await client.responses.create({
      model,
      input: [{ role: "user", content: [content, { type: "input_text", text: PROMPT }] }],
      text: { format: { type: "json_schema", name: "statement_debits", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
      max_output_tokens: 32000,
    });

    if (!response.output_text) throw new Error("The model returned an empty response. Try again.");
    const raw = JSON.parse(response.output_text) as { transactions: { date: string; description: string; amount: number; reference: string | null }[] };

    const rows: StatementRow[] = [];
    for (const t of raw.transactions) {
      const date = parseStatementDate(t.date);
      if (!date || !Number.isFinite(t.amount) || t.amount <= 0) continue;
      rows.push({
        date,
        description: t.description.replace(/\s+/g, " ").trim() || "(no description)",
        amount: Math.round(t.amount * 100) / 100,
        reference: t.reference,
      });
    }
    return rows;
  } finally {
    if (uploadedFileId) await client.files.delete(uploadedFileId).catch(() => {});
  }
}

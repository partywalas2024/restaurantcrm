// Reads restaurant supply bills out of a PDF or photo using OpenAI.
//
// PDFs go through the Files API rather than being inlined as base64: a
// forty-page scan of paper invoices is far too large for a request body. The
// uploaded copy is deleted once extraction finishes, since these are the
// restaurant's financial records and should not linger in third-party storage.
// The response shape is enforced by Structured Outputs, so it cannot drift.

import "server-only";

import OpenAI, { toFile } from "openai";
import type { ExtractedBill, ExtractedVendor } from "@/lib/import";
import { checkBill } from "@/lib/bill-check";

/** Override in .env if you want a different model (e.g. a newer or cheaper one). */
const DEFAULT_MODEL = "gpt-5.5";

export const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

/** OpenAI caps PDFs at 100 pages / 32MB; keep well inside that. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

const PROMPT = `This file contains one or more restaurant supply/purchase bills (tax invoices and/or sales returns). They are often scanned photographs of paper invoices, and a single bill may span several pages.

Extract every bill precisely:
- Vendor details (name, phone, address, GSTIN) — the supplier issuing the bill, NOT the restaurant being billed.
- For each bill: its number, whether it is an INVOICE or a RETURN (credit note), date, due date, subtotal, SGST, CGST, roundoff, grand total, and any handwritten notes.
- Every line item: product name exactly as printed, unit (KG, PKT, TIN, BAG, PCS...), HSN code if present, quantity, rate and amount.

Rules:
- If an invoice spans multiple pages, merge its line items into ONE bill entry. Use "TOTAL C/F" / "TOTAL B/F" and "Continued..." / "Page No..." markers to match continuations.
- Transcribe exactly what is printed. Never estimate, round or invent a figure. If a number is genuinely unreadable, use your best transcription of the visible digits rather than inventing a plausible total.
- Set billNumberUncertain to true only when the bill number itself is genuinely illegible.
- Credit notes / sales returns must be type RETURN. Everything else is INVOICE.
- Dates must be YYYY-MM-DD. Indian invoices are usually DD/MM/YYYY — convert accordingly.
- Use null for any field that is genuinely absent from the document.`;

// Structured Outputs in strict mode require every property to be listed in
// `required` and `additionalProperties: false` on every object — genuinely
// optional fields are expressed as nullable types instead.
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "bills"],
  properties: {
    vendor: {
      type: "object",
      additionalProperties: false,
      required: ["name", "phone", "address", "gstin"],
      properties: {
        name: { type: "string" },
        phone: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        gstin: { type: ["string", "null"] },
      },
    },
    bills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "billNumber",
          "billNumberUncertain",
          "type",
          "date",
          "dueDate",
          "subtotal",
          "sgst",
          "cgst",
          "roundoff",
          "grandTotal",
          "notes",
          "items",
        ],
        properties: {
          billNumber: { type: "string" },
          billNumberUncertain: { type: "boolean" },
          type: { type: "string", enum: ["INVOICE", "RETURN"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
          subtotal: { type: "number" },
          sgst: { type: "number" },
          cgst: { type: "number" },
          roundoff: { type: ["number", "null"] },
          grandTotal: { type: "number" },
          notes: { type: ["string", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "unit", "hsn", "qty", "rate", "amount"],
              properties: {
                name: { type: "string" },
                unit: { type: "string" },
                hsn: { type: ["string", "null"] },
                qty: { type: "number" },
                rate: { type: "number" },
                amount: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;

type RawResult = {
  vendor: { name: string; phone: string | null; address: string | null; gstin: string | null };
  bills: Array<{
    billNumber: string;
    billNumberUncertain: boolean;
    type: "INVOICE" | "RETURN";
    date: string;
    dueDate: string | null;
    subtotal: number;
    sgst: number;
    cgst: number;
    roundoff: number | null;
    grandTotal: number;
    notes: string | null;
    items: Array<{
      name: string;
      unit: string;
      hsn: string | null;
      qty: number;
      rate: number;
      amount: number;
    }>;
  }>;
};

/** The rest of the app models "absent" as undefined, not null. */
function undef<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function normalize(raw: RawResult): { vendor: ExtractedVendor; bills: ExtractedBill[] } {
  const result: { vendor: ExtractedVendor; bills: ExtractedBill[] } = {
    vendor: {
      name: raw.vendor.name,
      phone: undef(raw.vendor.phone),
      address: undef(raw.vendor.address),
      gstin: undef(raw.vendor.gstin),
    },
    bills: raw.bills.map((b) => ({
      billNumber: b.billNumber,
      billNumberUncertain: b.billNumberUncertain,
      type: b.type,
      date: b.date,
      dueDate: undef(b.dueDate),
      subtotal: b.subtotal,
      sgst: b.sgst,
      cgst: b.cgst,
      roundoff: b.roundoff ?? 0,
      grandTotal: b.grandTotal,
      notes: undef(b.notes),
      items: b.items.map((i) => ({
        name: i.name,
        unit: i.unit,
        hsn: undef(i.hsn),
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
      })),
    })),
  };

  // Re-derive the totals ourselves rather than trusting the transcription, so a
  // misread digit surfaces at review instead of quietly entering the books.
  for (const bill of result.bills) {
    bill.warnings = checkBill(bill);
  }

  return result;
}

export async function extractBillsFromFile(
  file: File,
): Promise<{ vendor: ExtractedVendor; bills: ExtractedBill[] }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const isPdf = file.type === "application/pdf";

  let uploadedFileId: string | null = null;

  try {
    let fileContent;

    if (isPdf) {
      // Upload rather than inlining base64: a 40-page scan of paper invoices is
      // far too large to embed in the request body.
      const uploaded = await client.files.create({
        file: await toFile(file, file.name || "bills.pdf", { type: "application/pdf" }),
        purpose: "user_data",
      });
      uploadedFileId = uploaded.id;
      fileContent = { type: "input_file" as const, file_id: uploaded.id };
    } else {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      fileContent = {
        type: "input_image" as const,
        image_url: `data:${file.type};base64,${base64}`,
        detail: "high" as const,
      };
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [fileContent, { type: "input_text", text: PROMPT }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "extracted_bills",
          strict: true,
          schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      // A 40-page bundle of invoices produces a lot of line items.
      max_output_tokens: 32000,
    });

    const text = response.output_text;
    if (!text) {
      throw new Error("The model returned an empty response. Try again.");
    }

    return normalize(JSON.parse(text) as RawResult);
  } finally {
    // Bills are business records we shouldn't leave sitting in OpenAI storage.
    if (uploadedFileId) {
      await client.files.delete(uploadedFileId).catch(() => {});
    }
  }
}

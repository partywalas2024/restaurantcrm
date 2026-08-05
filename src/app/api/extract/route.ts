import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { apiAuthGuard } from "@/lib/auth";

export const maxDuration = 300;

const EXTRACT_TOOL = {
  name: "record_extracted_bills",
  description: "Record the vendor and all bills/invoices found in the uploaded PDF.",
  input_schema: {
    type: "object" as const,
    properties: {
      vendor: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          gstin: { type: "string" },
        },
        required: ["name"],
      },
      bills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            billNumber: { type: "string" },
            billNumberUncertain: { type: "boolean" },
            type: { type: "string", enum: ["INVOICE", "RETURN"] },
            date: { type: "string", description: "YYYY-MM-DD" },
            dueDate: { type: "string", description: "YYYY-MM-DD" },
            subtotal: { type: "number" },
            sgst: { type: "number" },
            cgst: { type: "number" },
            roundoff: { type: "number" },
            grandTotal: { type: "number" },
            notes: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  unit: { type: "string" },
                  hsn: { type: "string" },
                  qty: { type: "number" },
                  rate: { type: "number" },
                  amount: { type: "number" },
                },
                required: ["name", "unit", "qty", "rate", "amount"],
              },
            },
          },
          required: ["billNumber", "type", "date", "subtotal", "sgst", "cgst", "grandTotal", "items"],
        },
      },
    },
    required: ["vendor", "bills"],
  },
};

export async function POST(req: NextRequest) {
  const denied = await apiAuthGuard();
  if (denied) return denied;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to your .env file (get one at console.anthropic.com) to enable automatic PDF extraction.",
      },
      { status: 501 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "record_extracted_bills" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text: "This PDF contains one or more restaurant supply/purchase bills (tax invoices and/or sales returns), possibly scanned photographs of paper invoices spanning multiple pages per bill. Extract every bill precisely: vendor details, and for each bill its number, type, date, due date, subtotal/tax/grand total, any handwritten notes, and every line item (product name, unit, HSN if present, quantity, rate, amount). If an invoice spans multiple pages, merge its line items into one bill entry — use 'TOTAL C/F' / 'TOTAL B/F' and 'Continued...' / 'Page No...' markers to match continuations. Do not estimate or invent figures — transcribe exactly what is printed, and set billNumberUncertain: true if a bill number is genuinely illegible. Call record_extracted_bills with the complete result.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Claude did not return structured data. Try again." }, { status: 502 });
    }

    return NextResponse.json({ result: toolUse.input, fileName: file.name });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed." },
      { status: 502 }
    );
  }
}

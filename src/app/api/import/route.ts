import { NextRequest, NextResponse } from "next/server";
import { importBills, type ExtractedBill, type ExtractedVendor } from "@/lib/import";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      vendor: ExtractedVendor;
      bills: ExtractedBill[];
      fileName?: string;
    };

    if (!body.vendor?.name || !Array.isArray(body.bills)) {
      return NextResponse.json({ error: "Malformed import payload." }, { status: 400 });
    }

    const result = await importBills(body.vendor, body.bills, body.fileName);
    return NextResponse.json({
      vendorName: result.vendor.name,
      billsCreated: result.billsCreated,
      lineItemsCreated: result.lineItemsCreated,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed." }, { status: 500 });
  }
}

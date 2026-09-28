// Saves reviewed bills to the database — the confirm step of the upload flow.

import { NextRequest, NextResponse } from "next/server";
import { importBills, type ExtractedBill, type ExtractedVendor } from "@/lib/import";
import { apiRestaurantGuard } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  try {
    const body = (await req.json()) as {
      vendor: ExtractedVendor;
      bills: ExtractedBill[];
      fileName?: string;
    };

    if (!body.vendor?.name || !Array.isArray(body.bills)) {
      return NextResponse.json({ error: "Malformed import payload." }, { status: 400 });
    }

    const result = await importBills(user.restaurantId, body.vendor, body.bills, body.fileName);
    await logActivity(
      user,
      "IMPORT",
      "Bill",
      null,
      `Imported ${result.billsCreated} bill(s), ${result.lineItemsCreated} line item(s) for ${result.vendor.name}${body.fileName ? ` from ${body.fileName}` : ""}`,
    );
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

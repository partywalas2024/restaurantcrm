// Vendor ledger export, laid out like a bank statement: every bill as a debit,
// every payment as a credit, with a running balance.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getVendorLedger } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { apiRestaurantGuard } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  const vendorId = req.nextUrl.searchParams.get("vendorId");
  if (!vendorId) {
    return NextResponse.json({ error: "vendorId is required." }, { status: 400 });
  }

  const ledger = await getVendorLedger(user.restaurantId, vendorId).catch(() => null);
  if (!ledger) {
    return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  }
  const { vendor, entries, totalDebit, totalCredit, balance } = ledger;

  const rows: (string | number)[][] = [
    ["Statement of Account"],
    ["Vendor", vendor.name],
    ["Phone", vendor.phone ?? ""],
    ["Address", vendor.address ?? ""],
    ["GSTIN", vendor.gstin ?? ""],
    ["Statement Generated", formatDate(new Date())],
    [],
    ["Date", "Particulars", "Debit (INR)", "Credit (INR)", "Balance (INR)"],
    ...entries.map((e) => [
      formatDate(e.date),
      e.particulars,
      e.debit > 0 ? e.debit.toFixed(2) : "",
      e.credit > 0 ? e.credit.toFixed(2) : "",
      e.balance.toFixed(2),
    ]),
    [],
    ["", "Total Billed", totalDebit.toFixed(2), "", ""],
    ["", "Total Paid / Credited", "", totalCredit.toFixed(2), ""],
    ["", balance >= 0 ? "Closing Balance (You Owe)" : "Closing Balance (Vendor Owes You)", "", "", Math.abs(balance).toFixed(2)],
  ];

  const csv = Papa.unparse(rows);
  const filename = `${vendor.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-statement.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

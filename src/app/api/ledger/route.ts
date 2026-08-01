import { NextRequest, NextResponse } from "next/server";
import { getVendorLedger } from "@/lib/data";
import { formatDate } from "@/lib/format";

export async function GET(req: NextRequest) {
  const vendorId = req.nextUrl.searchParams.get("vendorId");
  if (!vendorId) return NextResponse.json({ error: "vendorId is required." }, { status: 400 });

  const ledger = await getVendorLedger(vendorId).catch(() => null);
  if (!ledger) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  const { vendor, entries, totalDebit, totalCredit, balance } = ledger;

  return NextResponse.json({
    vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone, address: vendor.address, gstin: vendor.gstin },
    entries: entries.map((e) => ({
      date: formatDate(e.date),
      type: e.type,
      particulars: e.particulars,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
    })),
    totalDebit,
    totalCredit,
    balance,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAvailableMonths, getOverview, getInsights, getVendors } from "@/lib/data";
import { CATEGORY_LABELS } from "@/lib/categories";

export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get("month");
  const months = await getAvailableMonths();
  const month = monthParam && months.includes(monthParam) ? monthParam : months[0];
  if (!month) return NextResponse.json({ error: "No data available." }, { status: 404 });

  const [overview, insights, vendors] = await Promise.all([
    getOverview(month),
    getInsights(month),
    getVendors(),
  ]);

  const topBills = [...overview.bills]
    .filter((b) => b.type === "INVOICE")
    .sort((a, b) => b.grandTotal - a.grandTotal)
    .slice(0, 10)
    .map((b) => ({
      billNumber: b.billNumber,
      date: b.date.toISOString().slice(0, 10),
      vendor: b.vendor.name,
      amount: b.grandTotal,
    }));

  return NextResponse.json({
    month,
    totalSpend: overview.totalSpend,
    prevSpend: overview.prevSpend,
    totalBills: overview.totalBills,
    stockValue: overview.stockValue,
    lowStockCount: overview.lowStockCount,
    pendingPayments: overview.pendingPayments,
    insights,
    categorySpend: overview.categorySpend.map((c) => ({ label: CATEGORY_LABELS[c.category], amount: c.amount })),
    topVendors: vendors.slice(0, 5).map((v) => ({ name: v.name, amount: v.totalAmount })),
    topBills,
  });
}

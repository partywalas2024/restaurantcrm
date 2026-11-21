// Excel export — the multi-sheet counterpart to the CSV route.
//
// Each `?kind=` builds a workbook with a summary sheet plus one sheet per
// section, so a month's figures arrive as a single file an accountant can open
// rather than a folder of loose CSVs.

import { NextRequest, NextResponse } from "next/server";
import {
  getBills,
  getVendors,
  getProducts,
  getVendorLedger,
  ledgerStatementRows,
  getBalanceSheet,
  getOverview,
  getInsights,
  getDailyTrend,
  getMonthlyTrend,
  getAvailableMonths,
} from "@/lib/data";
import { addTableSheet, addSummarySheet, newWorkbook, workbookResponse, slugFilename } from "@/lib/excel";
import { getRestaurant } from "@/lib/settings";
import { getRevenueTrend, getMenuItemPerformance, getSalesForMonth, getDayOfWeekPattern, projectNextValue } from "@/lib/sales";
import { formatDate, formatMonth } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { ProductCategory } from "@/generated/prisma/enums";
import { apiRestaurantGuard } from "@/lib/auth";

const BILL_COLUMNS = [
  { header: "Bill Number", key: "billNumber", width: 16 },
  { header: "Date", key: "date", width: 14 },
  { header: "Type", key: "type", width: 10 },
  { header: "Vendor", key: "vendor", width: 28 },
  { header: "Category", key: "category", width: 18 },
  { header: "Line Items", key: "lineItems", width: 10, number: true },
  { header: "Subtotal", key: "subtotal", width: 14, currency: true },
  { header: "SGST", key: "sgst", width: 12, currency: true },
  { header: "CGST", key: "cgst", width: 12, currency: true },
  { header: "Grand Total", key: "grandTotal", width: 14, currency: true },
  { header: "Payment Status", key: "paymentStatus", width: 16 },
  { header: "Notes", key: "notes", width: 40 },
];

async function resolveMonth(restaurantId: string, requested: string | null) {
  const months = await getAvailableMonths(restaurantId);
  return requested && months.includes(requested) ? requested : months[0];
}

export async function GET(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "bills";
  // Profit-level exports are Owner-only; staff can still export bills, vendors, products and ledgers.
  if (["overview", "analytics", "balance-sheet"].includes(kind) && user.role !== "RESTAURANT_ADMIN") {
    return NextResponse.json({ error: "Only the owner can export this report." }, { status: 403 });
  }
  const wb = newWorkbook();
  const profile = await getRestaurant(user.restaurantId);
  const filePrefix = profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (kind === "bills") {
    const bills = await getBills(user.restaurantId, {
      vendorId: sp.get("vendorId") || undefined,
      category: (sp.get("category") as ProductCategory) || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      minAmount: sp.get("minAmount") ? Number(sp.get("minAmount")) : undefined,
      maxAmount: sp.get("maxAmount") ? Number(sp.get("maxAmount")) : undefined,
      search: sp.get("search") || undefined,
      paymentStatus: sp.get("paymentStatus") || undefined,
    });
    addTableSheet(
      wb,
      "Bills",
      BILL_COLUMNS,
      bills.map((b) => ({
        billNumber: b.billNumber,
        date: formatDate(b.date),
        type: b.type,
        vendor: b.vendor.name,
        category: CATEGORY_LABELS[b.category],
        lineItems: b.lineItems.length,
        subtotal: b.subtotal,
        sgst: b.sgst,
        cgst: b.cgst,
        grandTotal: b.grandTotal,
        paymentStatus: b.paymentStatus,
        notes: b.notes ?? "",
      }))
    );
    return workbookResponse(wb, `${filePrefix}-bills.xlsx`);
  }

  if (kind === "vendors") {
    const pending = sp.get("pending");
    const vendors = await getVendors(user.restaurantId, {
      search: sp.get("search") || undefined,
      pending: pending === "due" || pending === "clear" ? pending : undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
    });
    addTableSheet(
      wb,
      "Vendors",
      [
        { header: "Vendor", key: "name", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "Address", key: "address", width: 36 },
        { header: "GSTIN", key: "gstin", width: 20 },
        { header: "Total Purchase Amount", key: "totalAmount", width: 18, currency: true },
        { header: "Total Bills", key: "totalBills", width: 12, number: true },
        { header: "Items Supplied", key: "itemsSupplied", width: 14, number: true },
        { header: "Pending Amount", key: "pendingAmount", width: 16, currency: true },
        { header: "Last Order Date", key: "lastOrderDate", width: 16 },
      ],
      vendors.map((v) => ({
        name: v.name,
        phone: v.phone ?? "",
        address: v.address ?? "",
        gstin: v.gstin ?? "",
        totalAmount: v.totalAmount,
        totalBills: v.totalBills,
        itemsSupplied: v.itemsSupplied,
        pendingAmount: v.pendingAmount,
        lastOrderDate: v.lastOrderDate ? formatDate(v.lastOrderDate) : "",
      }))
    );
    return workbookResponse(wb, `${filePrefix}-vendors.xlsx`);
  }

  if (kind === "products") {
    const products = await getProducts(user.restaurantId);
    addTableSheet(
      wb,
      "Products",
      [
        { header: "Product", key: "name", width: 30 },
        { header: "Category", key: "category", width: 18 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Current Stock", key: "currentStock", width: 14, number: true },
        { header: "Reorder Level", key: "reorderLevel", width: 14, number: true },
        { header: "Status", key: "status", width: 14 },
        { header: "Last Cost Price", key: "lastCostPrice", width: 14, currency: true },
        { header: "Qty Purchased", key: "qtyPurchased", width: 14, number: true },
        { header: "Total Spend", key: "totalSpend", width: 14, currency: true },
        { header: "Times Purchased", key: "timesPurchased", width: 14, number: true },
        { header: "Vendor", key: "vendorName", width: 28 },
        { header: "Last Purchase Date", key: "lastPurchaseDate", width: 16 },
      ],
      products.map((p) => ({
        name: p.name,
        category: CATEGORY_LABELS[p.category],
        unit: p.unit,
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel,
        status: p.status,
        lastCostPrice: p.lastCostPrice,
        qtyPurchased: p.qtyPurchased,
        totalSpend: p.totalSpend,
        timesPurchased: p.timesPurchased,
        vendorName: p.vendorName,
        lastPurchaseDate: p.lastPurchaseDate ? formatDate(p.lastPurchaseDate) : "",
      }))
    );
    return workbookResponse(wb, `${filePrefix}-products.xlsx`);
  }

  if (kind === "ledger") {
    const vendorId = sp.get("vendorId");
    if (!vendorId) return NextResponse.json({ error: "vendorId is required." }, { status: 400 });
    const ledger = await getVendorLedger(user.restaurantId, vendorId, {
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
    }).catch(() => null);
    if (!ledger) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
    const { vendor, totalDebit, totalCredit, balance, period } = ledger;
    const statement = ledgerStatementRows(ledger);

    const summary = addSummarySheet(wb, "Statement", "Statement of Account");
    summary.addRow(["Vendor", vendor.name]);
    summary.addRow(["Phone", vendor.phone ?? ""]);
    summary.addRow(["Address", vendor.address ?? ""]);
    summary.addRow(["GSTIN", vendor.gstin ?? ""]);
    if (period) summary.addRow(["Period", period]);
    summary.addRow(["Statement Generated", formatDate(new Date())]);
    summary.addRow([]);
    summary.addRow([period ? "Billed in period" : "Total Billed", totalDebit]);
    summary.addRow([period ? "Paid in period" : "Total Paid / Credited", totalCredit]);
    summary.addRow([
      balance >= 0
        ? period ? "Current outstanding (You Owe)" : "Closing Balance (You Owe)"
        : period ? "Current outstanding (Vendor Owes You)" : "Closing Balance (Vendor Owes You)",
      Math.abs(balance),
    ]);

    addTableSheet(
      wb,
      "Ledger",
      [
        { header: "Date", key: "date", width: 14 },
        { header: "Particulars", key: "particulars", width: 36 },
        { header: "Debit (INR)", key: "debit", width: 14, currency: true },
        { header: "Credit (INR)", key: "credit", width: 14, currency: true },
        { header: "Balance (INR)", key: "balance", width: 14, currency: true },
      ],
      statement.map((e) => ({
        date: e.date,
        particulars: e.particulars,
        debit: e.debit || "",
        credit: e.credit || "",
        balance: e.balance,
      }))
    );
    return workbookResponse(wb, slugFilename(vendor.name, "statement"));
  }

  if (kind === "overview") {
    const month = await resolveMonth(user.restaurantId, sp.get("month"));
    if (!month) return NextResponse.json({ error: "No data available." }, { status: 404 });
    const [overview, insights] = await Promise.all([getOverview(user.restaurantId, month), getInsights(user.restaurantId, month)]);

    const summary = addSummarySheet(wb, "Summary", `Overview — ${formatMonth(`${month}-01`)}`);
    summary.addRow(["Total Monthly Spend", overview.totalSpend]);
    summary.addRow(["Previous Month", overview.prevSpend]);
    summary.addRow(["Total Bills", overview.totalBills]);
    summary.addRow(["Returns", overview.totalReturns]);
    summary.addRow(["Products Tracked", overview.totalProductsTracked]);
    summary.addRow(["Current Stock Value", overview.stockValue]);
    summary.addRow(["Low Stock Items", overview.lowStockCount]);
    summary.addRow(["Out of Stock Items", overview.outOfStockCount]);
    summary.addRow(["Pending Payments", overview.pendingPayments]);
    summary.addRow(["Top Category", overview.topCategory ? CATEGORY_LABELS[overview.topCategory.category] : ""]);
    summary.addRow(["Top Vendor", overview.topVendor?.name ?? ""]);
    summary.addRow(["Top Product", overview.topProduct?.name ?? ""]);
    summary.addRow([]);
    summary.addRow(["Insights"]);
    insights.forEach((line) => summary.addRow([line]));

    addTableSheet(
      wb,
      "Category Breakdown",
      [
        { header: "Category", key: "category", width: 22 },
        { header: "Amount", key: "amount", width: 16, currency: true },
      ],
      overview.categorySpend
        .sort((a, b) => b.amount - a.amount)
        .map((c) => ({ category: CATEGORY_LABELS[c.category], amount: c.amount }))
    );

    addTableSheet(
      wb,
      "Bills",
      BILL_COLUMNS,
      overview.bills.map((b) => ({
        billNumber: b.billNumber,
        date: formatDate(b.date),
        type: b.type,
        vendor: b.vendor.name,
        category: CATEGORY_LABELS[b.category],
        lineItems: b.lineItems.length,
        subtotal: b.subtotal,
        sgst: b.sgst,
        cgst: b.cgst,
        grandTotal: b.grandTotal,
        paymentStatus: b.paymentStatus,
        notes: b.notes ?? "",
      }))
    );

    return workbookResponse(wb, `${filePrefix}-overview-${month}.xlsx`);
  }

  if (kind === "expenses") {
    const month = await resolveMonth(user.restaurantId, sp.get("month"));
    if (!month) return NextResponse.json({ error: "No data available." }, { status: 404 });
    const overview = await getOverview(user.restaurantId, month);
    const total = overview.categorySpend.reduce((s, c) => s + c.amount, 0);

    const summary = addSummarySheet(wb, "Summary", `Expense Analysis — ${formatMonth(`${month}-01`)}`);
    summary.addRow(["Total Monthly Expense", overview.totalSpend]);
    summary.addRow(["Previous Month", overview.prevSpend]);
    summary.addRow(["Categories Active", overview.categorySpend.length]);

    addTableSheet(
      wb,
      "Category Breakdown",
      [
        { header: "Category", key: "category", width: 22 },
        { header: "Amount", key: "amount", width: 16, currency: true },
        { header: "% of Total", key: "pct", width: 12 },
      ],
      overview.categorySpend
        .sort((a, b) => b.amount - a.amount)
        .map((c) => ({
          category: CATEGORY_LABELS[c.category],
          amount: c.amount,
          pct: total > 0 ? `${((c.amount / total) * 100).toFixed(1)}%` : "0.0%",
        }))
    );

    return workbookResponse(wb, `${filePrefix}-expenses-${month}.xlsx`);
  }

  if (kind === "analytics") {
    const month = await resolveMonth(user.restaurantId, sp.get("month"));
    if (!month) return NextResponse.json({ error: "No data available." }, { status: 404 });
    const [overview, daily, vendors, products, trend, revenueTrend, menuPerf, salesMonth, dayPattern] = await Promise.all([
      getOverview(user.restaurantId, month),
      getDailyTrend(user.restaurantId, month),
      getVendors(user.restaurantId),
      getProducts(user.restaurantId),
      getMonthlyTrend(user.restaurantId),
      getRevenueTrend(user.restaurantId),
      getMenuItemPerformance(user.restaurantId, month),
      getSalesForMonth(user.restaurantId, month),
      getDayOfWeekPattern(user.restaurantId),
    ]);

    addTableSheet(
      wb,
      "Daily Spending",
      [
        { header: "Date", key: "date", width: 14 },
        { header: "Amount", key: "amount", width: 16, currency: true },
      ],
      daily.map((d) => ({ date: formatDate(d.date), amount: d.amount }))
    );

    addTableSheet(
      wb,
      "Month Comparison",
      [
        { header: "Month", key: "month", width: 14 },
        { header: "Amount", key: "amount", width: 16, currency: true },
      ],
      trend.map((t) => ({ month: formatMonth(`${t.month}-01`), amount: t.amount }))
    );

    addTableSheet(
      wb,
      "Vendor Breakdown",
      [
        { header: "Vendor", key: "vendor", width: 28 },
        { header: "Total Purchases", key: "amount", width: 16, currency: true },
      ],
      vendors.map((v) => ({ vendor: v.name, amount: v.totalAmount }))
    );

    const topBills = [...overview.bills].filter((b) => b.type === "INVOICE").sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 10);
    addTableSheet(
      wb,
      "Top 10 Purchases",
      [
        { header: "Bill Number", key: "billNumber", width: 16 },
        { header: "Date", key: "date", width: 14 },
        { header: "Vendor", key: "vendor", width: 28 },
        { header: "Amount", key: "amount", width: 16, currency: true },
      ],
      topBills.map((b) => ({ billNumber: b.billNumber, date: formatDate(b.date), vendor: b.vendor.name, amount: b.grandTotal }))
    );

    addTableSheet(
      wb,
      "Low Stock",
      [
        { header: "Product", key: "product", width: 28 },
        { header: "Current Stock", key: "stock", width: 14, number: true },
        { header: "Reorder Level", key: "reorder", width: 14, number: true },
      ],
      products
        .filter((p) => p.status === "LOW_STOCK" || p.status === "OUT_OF_STOCK")
        .map((p) => ({ product: p.name, stock: p.currentStock, reorder: p.reorderLevel }))
    );

    addTableSheet(
      wb,
      "Revenue Trend",
      [
        { header: "Month", key: "month", width: 14 },
        { header: "Revenue", key: "amount", width: 16, currency: true },
      ],
      revenueTrend.map((t) => ({ month: formatMonth(`${t.month}-01`), amount: t.amount }))
    );

    addTableSheet(
      wb,
      "Revenue by Channel",
      [
        { header: "Channel", key: "channel", width: 16 },
        { header: "Revenue", key: "amount", width: 16, currency: true },
      ],
      [
        { channel: "Dine-in", amount: salesMonth.channelSplit.dineIn },
        { channel: "Delivery", amount: salesMonth.channelSplit.delivery },
        { channel: "Takeaway", amount: salesMonth.channelSplit.takeaway },
        { channel: "Other", amount: salesMonth.channelSplit.other },
      ]
    );

    addTableSheet(
      wb,
      "Top Sellers",
      [
        { header: "Menu Item", key: "name", width: 26 },
        { header: "Qty Sold", key: "qty", width: 12, number: true },
        { header: "Revenue", key: "revenue", width: 16, currency: true },
        { header: "Margin %", key: "marginPct", width: 12 },
      ],
      menuPerf.slice(0, 20).map((m) => ({
        name: m.name,
        qty: m.qty,
        revenue: m.revenue,
        marginPct: m.marginPct !== null ? `${m.marginPct.toFixed(0)}%` : "—",
      }))
    );

    addTableSheet(
      wb,
      "Revenue by Day of Week",
      [
        { header: "Day", key: "label", width: 14 },
        { header: "Avg Revenue/Day", key: "avgRevenue", width: 18, currency: true },
        { header: "Days Recorded", key: "days", width: 14, number: true },
      ],
      dayPattern.map((d) => ({ label: d.label, avgRevenue: d.avgRevenue, days: d.days }))
    );

    const revenueProjection = projectNextValue(revenueTrend);
    const spendProjection = projectNextValue(trend);
    if (revenueProjection || spendProjection) {
      addTableSheet(
        wb,
        "Next Month Projection",
        [
          { header: "Metric", key: "metric", width: 24 },
          { header: "Month", key: "month", width: 14 },
          { header: "Projected", key: "amount", width: 16, currency: true },
        ],
        [
          revenueProjection && { metric: "Revenue", month: formatMonth(`${revenueProjection.nextMonth}-01`), amount: revenueProjection.projected },
          spendProjection && { metric: "Purchase Spend", month: formatMonth(`${spendProjection.nextMonth}-01`), amount: spendProjection.projected },
        ].filter((r): r is { metric: string; month: string; amount: number } => Boolean(r))
      );
    }

    return workbookResponse(wb, `${filePrefix}-analytics-${month}.xlsx`);
  }

  if (kind === "balance-sheet") {
    const sheet = await getBalanceSheet(user.restaurantId);

    const summary = addSummarySheet(wb, "Summary", `Balance Sheet — ${formatDate(new Date())}`);
    summary.addRow(["Total Assets (Inventory)", sheet.totalAssets]);
    summary.addRow(["Total Liabilities (Payable)", sheet.totalLiabilities]);
    summary.addRow(["Net Position", sheet.netPosition]);

    addTableSheet(
      wb,
      "Assets",
      [
        { header: "Line", key: "line", width: 36 },
        { header: "Amount", key: "amount", width: 16, currency: true },
      ],
      [{ line: "Inventory (current stock, at last purchase cost)", amount: sheet.stockValue }]
    );

    addTableSheet(
      wb,
      "Liabilities",
      [
        { header: "Vendor", key: "vendor", width: 30 },
        { header: "Amount Payable", key: "amount", width: 16, currency: true },
      ],
      sheet.accountsPayable.map((v) => ({ vendor: v.vendorName, amount: v.balance }))
    );

    return workbookResponse(wb, `${filePrefix}-balance-sheet.xlsx`);
  }

  return NextResponse.json({ error: `Unknown export kind: ${kind}` }, { status: 400 });
}

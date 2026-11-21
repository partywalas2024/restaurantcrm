// Read model for the purchase side of the business: bills, vendors, products,
// inventory and the vendor ledger.
//
// Bills are the source of truth. Expenses, inventory levels and category
// spending are all derived here rather than stored, so purchase data is only
// ever entered once. Every function is a plain server-side read — callers are
// React Server Components, which is why nothing here is memoized or cached.
//
// Every function takes `restaurantId` as its first argument and every query
// filters on it. This is the tenant boundary: a caller without a restaurantId
// (a SUPER_ADMIN) cannot call these functions meaningfully at all, since
// `requireRestaurantUser()` is what supplies the id in the first place.

import { prisma } from "@/lib/prisma";
import { monthKey, formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import type { ProductCategory } from "@/generated/prisma/enums";

export type StockStatus = "OUT_OF_STOCK" | "LOW_STOCK" | "OVERSTOCKED" | "HEALTHY";

export function stockStatus(currentStock: number, reorderLevel: number): StockStatus {
  if (currentStock <= 0) return "OUT_OF_STOCK";
  if (reorderLevel > 0 && currentStock <= reorderLevel) return "LOW_STOCK";
  if (reorderLevel > 0 && currentStock >= reorderLevel * 4) return "OVERSTOCKED";
  return "HEALTHY";
}

/** All months (YYYY-MM) that have at least one bill, newest first. */
export async function getAvailableMonths(restaurantId: string): Promise<string[]> {
  const bills = await prisma.bill.findMany({ where: { restaurantId }, select: { date: true } });
  const set = new Set(bills.map((b) => monthKey(b.date)));
  return Array.from(set).sort().reverse();
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

/**
 * What's owed to each vendor right now: INVOICE bills add to the balance,
 * RETURN bills and Payments reduce it. This is the single source of truth
 * for "pending"/"payable" anywhere in the app — never a hand-typed number.
 */
export async function getAccountsPayable(restaurantId: string) {
  const vendors = await prisma.vendor.findMany({
    where: { restaurantId },
    include: { bills: { select: { type: true, grandTotal: true } }, payments: { select: { amount: true } } },
  });

  return vendors
    .map((v) => {
      const invoiceTotal = v.bills.filter((b) => b.type === "INVOICE").reduce((s, b) => s + b.grandTotal, 0);
      const returnTotal = v.bills.filter((b) => b.type === "RETURN").reduce((s, b) => s + b.grandTotal, 0);
      const paymentTotal = v.payments.reduce((s, p) => s + p.amount, 0);
      return {
        vendorId: v.id,
        vendorName: v.name,
        invoiceTotal,
        returnTotal,
        paymentTotal,
        balance: invoiceTotal - returnTotal - paymentTotal,
      };
    })
    .sort((a, b) => b.balance - a.balance);
}

export type LedgerEntry = {
  id: string;
  date: Date;
  type: "BILL" | "RETURN" | "PAYMENT";
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
};

export type VendorLedgerFilters = {
  from?: string;
  to?: string;
};

/** YYYY-MM-DD from a query string, or undefined when it is missing or invalid. */
export function cleanDay(value?: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isNaN(time) ? undefined : value;
}

function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function ledgerPeriodLabel(from?: string, to?: string): string | null {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Up to ${formatDate(to)}`;
  return null;
}

export type LedgerStatementRow = {
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
};

/** Ledger rows for a statement, with the carried-forward balance as the first line when a From date is set. */
export function ledgerStatementRows(ledger: {
  openingBalance: number | null;
  from?: string;
  entries: LedgerEntry[];
}): LedgerStatementRow[] {
  const rows = ledger.entries.map((e) => ({
    date: formatDate(e.date),
    particulars: e.particulars,
    debit: e.debit,
    credit: e.credit,
    balance: e.balance,
  }));
  if (ledger.openingBalance !== null) {
    rows.unshift({
      date: ledger.from ? formatDate(ledger.from) : "",
      particulars: "Opening balance",
      debit: 0,
      credit: 0,
      balance: ledger.openingBalance,
    });
  }
  return rows;
}

export async function getVendorLedger(restaurantId: string, vendorId: string, filters?: VendorLedgerFilters) {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, restaurantId } });
  if (!vendor) return null;

  const [bills, payments] = await Promise.all([
    prisma.bill.findMany({ where: { vendorId, restaurantId }, orderBy: { date: "asc" } }),
    prisma.payment.findMany({ where: { vendorId }, orderBy: { date: "asc" } }),
  ]);

  type Raw = Omit<LedgerEntry, "balance"> & { createdAt: Date };
  const raw: Raw[] = [];

  for (const b of bills) {
    if (b.type === "INVOICE") {
      raw.push({
        id: b.id,
        date: b.date,
        type: "BILL",
        particulars: `Invoice ${b.billNumber}`,
        debit: b.grandTotal,
        credit: 0,
        createdAt: b.createdAt,
      });
    } else {
      raw.push({
        id: b.id,
        date: b.date,
        type: "RETURN",
        particulars: `Return ${b.billNumber}`,
        debit: 0,
        credit: b.grandTotal,
        createdAt: b.createdAt,
      });
    }
  }
  for (const p of payments) {
    raw.push({
      id: p.id,
      date: p.date,
      type: "PAYMENT",
      particulars: `Payment — ${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` (${p.reference})` : ""}`,
      debit: 0,
      credit: p.amount,
      createdAt: p.createdAt,
    });
  }

  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());

  let running = 0;
  const all: LedgerEntry[] = raw.map((r) => {
    running += r.debit - r.credit;
    return { id: r.id, date: r.date, type: r.type, particulars: r.particulars, debit: r.debit, credit: r.credit, balance: running };
  });

  const from = cleanDay(filters?.from);
  const to = cleanDay(filters?.to);
  const fromTime = from ? dayStart(from).getTime() : null;
  const toTime = to ? dayStart(to).getTime() + 86400000 : null;
  const inRange = (date: Date) => {
    const time = date.getTime();
    if (fromTime !== null && time < fromTime) return false;
    if (toTime !== null && time >= toTime) return false;
    return true;
  };

  const entries = fromTime === null && toTime === null ? all : all.filter((e) => inRange(e.date));
  const openingBalance =
    fromTime === null ? null : (all.filter((e) => e.date.getTime() < fromTime).at(-1)?.balance ?? 0);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return {
    vendor,
    entries,
    openingBalance,
    totalDebit,
    totalCredit,
    // Always the real outstanding, even when the table is limited to a date range.
    balance: running,
    from,
    to,
    period: ledgerPeriodLabel(from, to),
  };
}

export async function getBalanceSheet(restaurantId: string) {
  const [products, payable] = await Promise.all([
    prisma.product.findMany({ where: { restaurantId } }),
    getAccountsPayable(restaurantId),
  ]);

  const stockValue = products.reduce((s, p) => s + Math.max(p.currentStock, 0) * p.lastCostPrice, 0);
  const accountsPayable = payable.filter((v) => v.balance > 0.005);
  const totalPayable = accountsPayable.reduce((s, v) => s + v.balance, 0);
  const totalAssets = stockValue;
  const totalLiabilities = totalPayable;

  return {
    stockValue,
    totalAssets,
    accountsPayable,
    totalPayable,
    totalLiabilities,
    netPosition: totalAssets - totalLiabilities,
  };
}

export async function getOverview(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return monthKey(d);
  })();
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  const [bills, prevBills, products, vendors] = await Promise.all([
    prisma.bill.findMany({
      where: { restaurantId, date: { gte: start, lt: end } },
      include: { vendor: true, lineItems: { include: { product: true } } },
    }),
    prisma.bill.findMany({ where: { restaurantId, date: { gte: prevStart, lt: prevEnd } } }),
    prisma.product.findMany({ where: { restaurantId } }),
    prisma.vendor.findMany({ where: { restaurantId } }),
  ]);

  const invoices = bills.filter((b) => b.type === "INVOICE");
  const returns = bills.filter((b) => b.type === "RETURN");
  const totalSpend =
    invoices.reduce((s, b) => s + b.grandTotal, 0) - returns.reduce((s, b) => s + b.grandTotal, 0);
  const prevInvoices = prevBills.filter((b) => b.type === "INVOICE");
  const prevReturns = prevBills.filter((b) => b.type === "RETURN");
  const prevSpend =
    prevInvoices.reduce((s, b) => s + b.grandTotal, 0) - prevReturns.reduce((s, b) => s + b.grandTotal, 0);

  const productIdsThisMonth = new Set<string>();
  const categorySpend = new Map<ProductCategory, number>();
  const vendorSpend = new Map<string, number>();
  const productSpend = new Map<string, { name: string; qty: number; amount: number; unit: string }>();

  for (const bill of bills) {
    const sign = bill.type === "RETURN" ? -1 : 1;
    vendorSpend.set(bill.vendorId, (vendorSpend.get(bill.vendorId) ?? 0) + sign * bill.grandTotal);
    for (const li of bill.lineItems) {
      productIdsThisMonth.add(li.productId);
      const cat = li.product.category;
      categorySpend.set(cat, (categorySpend.get(cat) ?? 0) + sign * li.amount);
      const entry = productSpend.get(li.productId) ?? {
        name: li.product.name,
        qty: 0,
        amount: 0,
        unit: li.unit,
      };
      entry.qty += sign * li.quantity;
      entry.amount += sign * li.amount;
      productSpend.set(li.productId, entry);
    }
  }

  const topCategory = [...categorySpend.entries()].sort((a, b) => b[1] - a[1])[0];
  const topVendorEntry = [...vendorSpend.entries()].sort((a, b) => b[1] - a[1])[0];
  const topVendor = topVendorEntry
    ? vendors.find((v) => v.id === topVendorEntry[0])
    : undefined;
  const topProductEntry = [...productSpend.values()].sort((a, b) => b.amount - a.amount)[0];

  const lowStock = products.filter((p) => stockStatus(p.currentStock, p.reorderLevel) === "LOW_STOCK");
  const outOfStock = products.filter((p) => stockStatus(p.currentStock, p.reorderLevel) === "OUT_OF_STOCK");
  const stockValue = products.reduce((s, p) => s + Math.max(p.currentStock, 0) * p.lastCostPrice, 0);
  const payable = await getAccountsPayable(restaurantId);
  const pendingPayments = payable.reduce((s, v) => s + Math.max(v.balance, 0), 0);

  return {
    month,
    totalSpend,
    prevSpend,
    totalBills: invoices.length,
    totalReturns: returns.length,
    totalProductsTracked: productIdsThisMonth.size,
    stockValue,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    pendingPayments,
    topCategory: topCategory ? { category: topCategory[0], amount: topCategory[1] } : null,
    topVendor: topVendor ? { name: topVendor.name, amount: topVendorEntry![1] } : null,
    topProduct: topProductEntry ?? null,
    categorySpend: [...categorySpend.entries()].map(([category, amount]) => ({ category, amount })),
    lowStockItems: lowStock,
    outOfStockItems: outOfStock,
    bills,
  };
}

export async function getBills(restaurantId: string, filters?: {
  vendorId?: string;
  category?: ProductCategory;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  paymentStatus?: string;
}) {
  const where: Record<string, unknown> = { restaurantId };
  if (filters?.vendorId) where.vendorId = filters.vendorId;
  if (filters?.category) where.category = filters.category;
  if (filters?.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters?.from || filters?.to) {
    where.date = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lt: new Date(new Date(filters.to).getTime() + 86400000) } : {}),
    };
  }
  if (filters?.minAmount || filters?.maxAmount) {
    where.grandTotal = {
      ...(filters.minAmount ? { gte: filters.minAmount } : {}),
      ...(filters.maxAmount ? { lte: filters.maxAmount } : {}),
    };
  }
  if (filters?.search) {
    where.OR = [
      { billNumber: { contains: filters.search } },
      { notes: { contains: filters.search } },
    ];
  }

  return prisma.bill.findMany({
    where,
    include: { vendor: true, lineItems: true },
    orderBy: { date: "desc" },
  });
}

export async function getBillById(restaurantId: string, id: string) {
  return prisma.bill.findFirst({
    where: { id, restaurantId },
    include: { vendor: true, lineItems: { include: { product: true } } },
  });
}

export type VendorFilters = {
  search?: string;
  /** "due" = has pending balance; "clear" = nothing owed */
  pending?: "due" | "clear";
  from?: string;
  to?: string;
};

export async function getVendors(restaurantId: string, filters?: VendorFilters) {
  const [vendors, payable] = await Promise.all([
    prisma.vendor.findMany({
      where: { restaurantId },
      include: {
        bills: { include: { lineItems: true } },
        payments: true,
      },
    }),
    getAccountsPayable(restaurantId),
  ]);
  const payableByVendor = new Map(payable.map((p) => [p.vendorId, p.balance]));

  const search = filters?.search?.trim().toLowerCase();
  const fromDate = filters?.from ? new Date(filters.from) : null;
  const toDate = filters?.to ? new Date(new Date(filters.to).getTime() + 86400000) : null;

  return vendors
    .map((v) => {
      const invoices = v.bills.filter((b) => b.type === "INVOICE");
      const returns = v.bills.filter((b) => b.type === "RETURN");
      const totalAmount =
        invoices.reduce((s, b) => s + b.grandTotal, 0) - returns.reduce((s, b) => s + b.grandTotal, 0);
      const itemSet = new Set<string>();
      v.bills.forEach((b) => b.lineItems.forEach((li) => itemSet.add(li.productId)));
      const lastOrder = v.bills
        .filter((b) => b.type === "INVOICE")
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      return {
        id: v.id,
        name: v.name,
        phone: v.phone,
        address: v.address,
        gstin: v.gstin,
        totalAmount,
        totalBills: invoices.length,
        totalPayments: v.payments.length,
        itemsSupplied: itemSet.size,
        pendingAmount: payableByVendor.get(v.id) ?? 0,
        lastOrderDate: lastOrder?.date ?? null,
      };
    })
    .filter((v) => {
      if (search) {
        const haystack = [v.name, v.phone ?? "", v.address ?? "", v.gstin ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters?.pending === "due" && v.pendingAmount <= 0.005) return false;
      if (filters?.pending === "clear" && v.pendingAmount > 0.005) return false;
      if (fromDate || toDate) {
        if (!v.lastOrderDate) return false;
        if (fromDate && v.lastOrderDate < fromDate) return false;
        if (toDate && v.lastOrderDate >= toDate) return false;
      }
      return true;
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function getProducts(restaurantId: string) {
  const products = await prisma.product.findMany({
    where: { restaurantId },
    include: {
      vendor: true,
      lineItems: { include: { bill: true } },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => {
    const purchaseItems = p.lineItems.filter((li) => li.bill.type === "INVOICE");
    const returnItems = p.lineItems.filter((li) => li.bill.type === "RETURN");
    const qtyPurchased = purchaseItems.reduce((s, li) => s + li.quantity, 0);
    const totalSpend =
      purchaseItems.reduce((s, li) => s + li.amount, 0) - returnItems.reduce((s, li) => s + li.amount, 0);
    const timesPurchased = purchaseItems.length;

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      currentStock: p.currentStock,
      reorderLevel: p.reorderLevel,
      lastCostPrice: p.lastCostPrice,
      vendorName: p.vendor?.name ?? "—",
      lastPurchaseDate: p.lastPurchaseDate,
      qtyPurchased,
      totalSpend,
      timesPurchased,
      status: stockStatus(p.currentStock, p.reorderLevel),
      isUncertain: p.isUncertain,
    };
  });
}

export async function getMonthlyTrend(restaurantId: string) {
  const bills = await prisma.bill.findMany({ where: { restaurantId }, select: { date: true, grandTotal: true, type: true } });
  const map = new Map<string, number>();
  for (const b of bills) {
    const key = monthKey(b.date);
    const sign = b.type === "RETURN" ? -1 : 1;
    map.set(key, (map.get(key) ?? 0) + sign * b.grandTotal);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([month, amount]) => ({ month, amount }));
}

export async function getDailyTrend(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const bills = await prisma.bill.findMany({
    where: { restaurantId, date: { gte: start, lt: end } },
    select: { date: true, grandTotal: true, type: true },
  });
  const map = new Map<string, number>();
  for (const b of bills) {
    const key = b.date.toISOString().slice(0, 10);
    const sign = b.type === "RETURN" ? -1 : 1;
    map.set(key, (map.get(key) ?? 0) + sign * b.grandTotal);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([date, amount]) => ({ date, amount }));
}

export async function getInsights(restaurantId: string, month: string) {
  const overview = await getOverview(restaurantId, month);
  const insights: string[] = [];

  if (overview.prevSpend > 0) {
    const change = ((overview.totalSpend - overview.prevSpend) / overview.prevSpend) * 100;
    insights.push(
      `Total monthly expenses ${change >= 0 ? "increased" : "decreased"} by ${Math.abs(change).toFixed(
        0
      )}% compared to the previous month.`
    );
  }

  const vendors = await getVendors(restaurantId);
  const totalAllVendors = vendors.reduce((s, v) => s + v.totalAmount, 0);
  if (vendors.length > 1 && totalAllVendors > 0) {
    let running = 0;
    let count = 0;
    for (const v of vendors) {
      running += v.totalAmount;
      count++;
      if (running / totalAllVendors >= 0.72) break;
    }
    insights.push(`${count} vendor${count > 1 ? "s" : ""} account for ${Math.round((running / totalAllVendors) * 100)}% of all-time purchases.`);
  } else if (vendors.length === 1) {
    insights.push(`All purchases this period came from a single vendor: ${vendors[0].name}.`);
  }

  if (overview.topCategory) {
    insights.push(`${CATEGORY_LABELS[overview.topCategory.category]} is the highest spending category this month.`);
  }

  if (overview.lowStockCount > 0) {
    insights.push(`${overview.lowStockCount} product${overview.lowStockCount > 1 ? "s are" : " is"} below reorder level.`);
  }

  if (overview.topProduct) {
    insights.push(`"${overview.topProduct.name}" was purchased most this month, totalling ${overview.topProduct.qty.toFixed(1)} units.`);
  }

  if (overview.pendingPayments > 0) {
    insights.push(`Pending payments total ${formatINR(overview.pendingPayments)}.`);
  }

  if (overview.topVendor) {
    insights.push(`You spent the most with ${overview.topVendor.name} this month.`);
  }

  return insights;
}

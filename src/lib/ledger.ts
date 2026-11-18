// Product ledger: the complete history of one product — every purchase, return,
// kitchen usage, stock count / adjustment and waste entry, oldest to newest,
// with a running stock balance.
//
// The balance is anchored to the product's CURRENT stock and walked backwards,
// so it always ends on the stock figure shown elsewhere in the app, even if old
// edits predate movement logging (that gap shows up as the opening balance).
// Waste rows are memo-only: waste entries do not change stock in this app.
//
// With no product chosen, `getLedgerSummary` gives one row per product over the
// same filters, each linking to its own ledger.

import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/format";
import { isAutoRecipeNote } from "@/lib/auto-consumption";
import type { ProductCategory } from "@/generated/prisma/enums";

export type LedgerType = "PURCHASE" | "RETURN" | "USAGE" | "ADJUSTMENT" | "WASTE";

export const LEDGER_TYPE_LABEL: Record<LedgerType, string> = {
  PURCHASE: "Purchase",
  RETURN: "Return to vendor",
  USAGE: "Used in kitchen",
  ADJUSTMENT: "Stock count / adjustment",
  WASTE: "Waste (memo)",
};

export type LedgerFilters = {
  product?: string;
  from?: string;
  to?: string;
  type?: LedgerType;
  vendor?: string;
  category?: ProductCategory;
  q?: string;
};

export type LedgerEntry = {
  key: string;
  date: Date;
  type: LedgerType;
  title: string;
  note: string | null;
  vendor: string | null;
  vendorId: string | null;
  link: string | null;
  qtyIn: number;
  qtyOut: number;
  rate: number | null;
  amount: number | null;
  affectsStock: boolean;
  balance: number;
};

const TYPE_ORDER: Record<LedgerType, number> = { PURCHASE: 0, RETURN: 1, ADJUSTMENT: 2, USAGE: 3, WASTE: 4 };

function day(s: string | undefined, end = false): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function getProductLedger(restaurantId: string, productId: string, f: LedgerFilters) {
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId },
    include: { vendor: { select: { name: true } } },
  });
  if (!product) return null;

  const [lines, moves, waste] = await Promise.all([
    prisma.billLineItem.findMany({
      where: { productId, bill: { restaurantId } },
      include: { bill: { select: { id: true, billNumber: true, date: true, type: true, vendor: { select: { id: true, name: true } } } } },
    }),
    prisma.inventoryMovement.findMany({ where: { productId, type: { in: ["CONSUMPTION", "ADJUSTMENT"] } } }),
    prisma.wasteEntry.findMany({ where: { restaurantId, productId } }),
  ]);

  type Raw = Omit<LedgerEntry, "balance">;
  const raw: Raw[] = [
    ...lines.map<Raw>((l) => {
      const isReturn = l.bill.type === "RETURN";
      return {
        key: `L-${l.id}`, date: l.bill.date, type: isReturn ? "RETURN" : "PURCHASE",
        title: `${isReturn ? "Return" : "Bill"} ${l.bill.billNumber}`, note: null,
        vendor: l.bill.vendor.name, vendorId: l.bill.vendor.id, link: `/bills/${l.bill.id}`,
        qtyIn: isReturn ? 0 : l.quantity, qtyOut: isReturn ? l.quantity : 0,
        rate: l.rate, amount: isReturn ? -l.amount : l.amount, affectsStock: true,
      };
    }),
    ...moves.map<Raw>((m) => {
      const auto = isAutoRecipeNote(m.notes);
      if (m.type === "CONSUMPTION") {
        return {
          key: `M-${m.id}`,
          date: m.date,
          type: "USAGE",
          title: auto ? "Recipe auto from sales" : "Used in kitchen",
          note: auto ? null : m.notes,
          vendor: null,
          vendorId: null,
          link: `/consumption/${productId}`,
          qtyIn: 0,
          qtyOut: -m.quantity,
          rate: null,
          amount: null,
          affectsStock: true,
        };
      }
      return {
        key: `M-${m.id}`,
        date: m.date,
        type: "ADJUSTMENT",
        title: m.quantity >= 0 ? "Stock adjusted up" : "Stock adjusted down",
        note: m.notes,
        vendor: null,
        vendorId: null,
        link: `/consumption/${productId}`,
        qtyIn: Math.max(m.quantity, 0),
        qtyOut: Math.max(-m.quantity, 0),
        rate: null,
        amount: null,
        affectsStock: true,
      };
    }),
    ...waste.map<Raw>((w) => ({
      key: `W-${w.id}`, date: w.date, type: "WASTE", title: "Waste logged", note: w.reason ?? w.notes, vendor: null, vendorId: null, link: "/waste",
      qtyIn: 0, qtyOut: w.quantity, rate: null, amount: w.estimatedCost > 0 ? w.estimatedCost : null, affectsStock: false,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

  const totalDelta = raw.filter((r) => r.affectsStock).reduce((s, r) => s + r.qtyIn - r.qtyOut, 0);
  const opening = product.currentStock - totalDelta;
  let bal = opening;
  const full: LedgerEntry[] = raw.map((r) => {
    if (r.affectsStock) bal += r.qtyIn - r.qtyOut;
    return { ...r, balance: bal };
  });

  const from = day(f.from);
  const to = day(f.to, true);
  const q = f.q?.trim().toLowerCase();
  const rows = full
    .filter((e) => !from || e.date >= from)
    .filter((e) => !to || e.date <= to)
    .filter((e) => !f.type || e.type === f.type)
    .filter((e) => !f.vendor || e.vendorId === f.vendor)
    .filter((e) => !q || `${e.title} ${e.note ?? ""} ${e.vendor ?? ""}`.toLowerCase().includes(q));

  const buys = rows.filter((r) => r.type === "PURCHASE");
  const rets = rows.filter((r) => r.type === "RETURN");
  const boughtQty = buys.reduce((s, r) => s + r.qtyIn, 0);
  const spend = buys.reduce((s, r) => s + (r.amount ?? 0), 0);
  const rates = buys.map((r) => r.rate ?? 0).filter((r) => r > 0);

  const byMonth = new Map<string, { qty: number; spend: number; count: number }>();
  for (const b of buys) {
    const k = monthKey(b.date);
    const cur = byMonth.get(k) ?? { qty: 0, spend: 0, count: 0 };
    byMonth.set(k, { qty: cur.qty + b.qtyIn, spend: cur.spend + (b.amount ?? 0), count: cur.count + 1 });
  }

  const vendors = Array.from(new Map(full.filter((e) => e.vendorId).map((e) => [e.vendorId!, e.vendor!])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    product,
    opening,
    rows: [...rows].reverse(), // newest first
    vendors,
    stats: {
      purchases: buys.length,
      boughtQty,
      spend,
      returnedQty: rets.reduce((s, r) => s + r.qtyOut, 0),
      returnedAmount: rets.reduce((s, r) => s - (r.amount ?? 0), 0),
      avgRate: boughtQty > 0 ? spend / boughtQty : null,
      minRate: rates.length ? Math.min(...rates) : null,
      maxRate: rates.length ? Math.max(...rates) : null,
      usedQty: rows.filter((r) => r.type === "USAGE").reduce((s, r) => s + r.qtyOut, 0),
      wastedQty: rows.filter((r) => r.type === "WASTE").reduce((s, r) => s + r.qtyOut, 0),
      adjustNet: rows.filter((r) => r.type === "ADJUSTMENT").reduce((s, r) => s + r.qtyIn - r.qtyOut, 0),
    },
    months: [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, v]) => ({ month, ...v, avgRate: v.qty > 0 ? v.spend / v.qty : null })),
  };
}

export async function getLedgerSummary(restaurantId: string, f: LedgerFilters) {
  const from = day(f.from);
  const to = day(f.to, true);
  const dateRange = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const hasRange = Boolean(from || to);
  const q = f.q?.trim();

  const products = await prisma.product.findMany({
    where: { restaurantId, ...(f.category ? { category: f.category } : {}), ...(q ? { name: { contains: q } } : {}) },
    select: { id: true, name: true, unit: true, category: true, currentStock: true },
    orderBy: { name: "asc" },
  });
  const ids = products.map((p) => p.id);

  const [lines, moves, waste] = await Promise.all([
    prisma.billLineItem.findMany({
      where: { productId: { in: ids }, bill: { restaurantId, ...(f.vendor ? { vendorId: f.vendor } : {}), ...(hasRange ? { date: dateRange } : {}) } },
      select: { productId: true, quantity: true, amount: true, bill: { select: { type: true, date: true } } },
    }),
    f.vendor
      ? Promise.resolve([])
      : prisma.inventoryMovement.findMany({ where: { productId: { in: ids }, type: "CONSUMPTION", ...(hasRange ? { date: dateRange } : {}) }, select: { productId: true, quantity: true } }),
    f.vendor
      ? Promise.resolve([])
      : prisma.wasteEntry.findMany({ where: { restaurantId, productId: { in: ids }, ...(hasRange ? { date: dateRange } : {}) }, select: { productId: true, quantity: true } }),
  ]);

  const agg = new Map<string, { purchases: number; qty: number; spend: number; used: number; wasted: number; last: Date | null }>();
  const get = (id: string) => agg.get(id) ?? { purchases: 0, qty: 0, spend: 0, used: 0, wasted: 0, last: null };
  for (const l of lines) {
    const a = get(l.productId);
    if (l.bill.type === "RETURN") { a.qty -= l.quantity; a.spend -= l.amount; }
    else { a.purchases++; a.qty += l.quantity; a.spend += l.amount; if (!a.last || l.bill.date > a.last) a.last = l.bill.date; }
    agg.set(l.productId, a);
  }
  for (const m of moves) { const a = get(m.productId); a.used -= m.quantity; agg.set(m.productId, a); }
  for (const w of waste) { const a = get(w.productId); a.wasted += w.quantity; agg.set(w.productId, a); }

  const rows = products
    .map((p) => {
      const a = agg.get(p.id);
      return { ...p, purchases: a?.purchases ?? 0, qty: a?.qty ?? 0, spend: a?.spend ?? 0, avgRate: a && a.qty > 0 ? a.spend / a.qty : null, used: a?.used ?? 0, wasted: a?.wasted ?? 0, lastPurchase: a?.last ?? null };
    })
    .filter((r) => r.purchases > 0 || r.used > 0 || r.wasted > 0 || r.qty !== 0 || (!hasRange && !f.vendor))
    .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));

  return { rows, totalSpend: rows.reduce((s, r) => s + r.spend, 0) };
}

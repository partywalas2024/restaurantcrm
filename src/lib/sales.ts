// Read model for the revenue side: sales, menu costing, labor, waste and P&L.
//
// The interesting piece is theoretical food cost. Rather than treating raw
// purchases as COGS, each menu item carries a recipe of Products, so cost of
// goods is computed from what was actually sold at real ingredient prices.
// Because recipes are optional, `getProfitAndLoss` reports food-cost % only
// over the portion of revenue whose items have recipes, and tells the caller
// how complete that coverage is instead of quietly understating cost.
//
// Every function takes `restaurantId` first and every query filters on it —
// see the note at the top of data.ts for why that's the tenant boundary.

import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/format";
import { NON_FOOD_CATEGORIES } from "@/lib/categories";
import { getOperatingExpenseTotal } from "@/lib/expenses";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

export async function getAvailableSalesMonths(restaurantId: string): Promise<string[]> {
  const rows = await prisma.dailySales.findMany({ where: { restaurantId }, select: { date: true } });
  const set = new Set(rows.map((r) => monthKey(r.date)));
  return Array.from(set).sort().reverse();
}

/** Union of months that have either sales or purchase data — used by pages (like P&L) that need both. */
export async function getAvailableBusinessMonths(restaurantId: string): Promise<string[]> {
  const [bills, sales, expenses] = await Promise.all([
    prisma.bill.findMany({ where: { restaurantId }, select: { date: true } }),
    prisma.dailySales.findMany({ where: { restaurantId }, select: { date: true } }),
    prisma.expense.findMany({ where: { restaurantId }, select: { date: true } }),
  ]);
  const set = new Set([
    ...bills.map((b) => monthKey(b.date)),
    ...sales.map((s) => monthKey(s.date)),
    ...expenses.map((e) => monthKey(e.date)),
  ]);
  return Array.from(set).sort().reverse();
}

/** Cost of one serving of a menu item, from its recipe × each ingredient's last purchase cost. */
export function computeRecipeCost(
  recipe: { quantity: number; product: { lastCostPrice: number } }[]
): number {
  return recipe.reduce((s, r) => s + r.quantity * r.product.lastCostPrice, 0);
}

export async function getMenuItems(restaurantId: string) {
  const items = await prisma.menuItem.findMany({
    where: { restaurantId },
    include: { recipe: { include: { product: true } } },
    orderBy: { name: "asc" },
  });
  return items.map((item) => {
    const cost = computeRecipeCost(item.recipe);
    const margin = item.sellingPrice - cost;
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      sellingPrice: item.sellingPrice,
      active: item.active,
      ingredientCount: item.recipe.length,
      cost,
      margin,
      marginPct: item.sellingPrice > 0 ? (margin / item.sellingPrice) * 100 : null,
      hasRecipe: item.recipe.length > 0,
    };
  });
}

export async function getMenuItemById(restaurantId: string, id: string) {
  return prisma.menuItem.findFirst({
    where: { id, restaurantId },
    include: { recipe: { include: { product: true } } },
  });
}

export async function getSalesForMonth(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    return monthKey(new Date(y, m - 2, 1));
  })();
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  const [rows, prevRows] = await Promise.all([
    prisma.dailySales.findMany({ where: { restaurantId, date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.dailySales.findMany({ where: { restaurantId, date: { gte: prevStart, lt: prevEnd } } }),
  ]);

  const revenueOf = (r: { dineInRevenue: number; deliveryRevenue: number; takeawayRevenue: number; otherRevenue: number }) =>
    r.dineInRevenue + r.deliveryRevenue + r.takeawayRevenue + r.otherRevenue;

  const totalRevenue = rows.reduce((s, r) => s + revenueOf(r), 0);
  const prevRevenue = prevRows.reduce((s, r) => s + revenueOf(r), 0);
  const totalCovers = rows.reduce((s, r) => s + r.covers, 0);

  const channelSplit = {
    dineIn: rows.reduce((s, r) => s + r.dineInRevenue, 0),
    delivery: rows.reduce((s, r) => s + r.deliveryRevenue, 0),
    takeaway: rows.reduce((s, r) => s + r.takeawayRevenue, 0),
    other: rows.reduce((s, r) => s + r.otherRevenue, 0),
  };
  const paymentSplit = {
    cash: rows.reduce((s, r) => s + r.cashAmount, 0),
    upi: rows.reduce((s, r) => s + r.upiAmount, 0),
    card: rows.reduce((s, r) => s + r.cardAmount, 0),
    other: rows.reduce((s, r) => s + r.otherPaymentAmount, 0),
  };

  const dailyTrend = rows.map((r) => ({ date: r.date, amount: revenueOf(r) }));

  return {
    month,
    rows,
    totalRevenue,
    prevRevenue,
    totalCovers,
    avgTicket: totalCovers > 0 ? totalRevenue / totalCovers : null,
    channelSplit,
    paymentSplit,
    dailyTrend,
    daysRecorded: rows.length,
  };
}

/** Monthly revenue across all recorded sales — the revenue-side counterpart to getMonthlyTrend(). */
export async function getRevenueTrend(restaurantId: string) {
  const rows = await prisma.dailySales.findMany({
    where: { restaurantId },
    select: { date: true, dineInRevenue: true, deliveryRevenue: true, takeawayRevenue: true, otherRevenue: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = monthKey(r.date);
    const total = r.dineInRevenue + r.deliveryRevenue + r.takeawayRevenue + r.otherRevenue;
    map.set(key, (map.get(key) ?? 0) + total);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([month, amount]) => ({ month, amount }));
}

export async function getMenuItemPerformance(restaurantId: string, month?: string) {
  const where = month
    ? { dailySales: { restaurantId, date: { gte: monthRange(month).start, lt: monthRange(month).end } } }
    : { dailySales: { restaurantId } };

  const sales = await prisma.menuItemSale.findMany({
    where,
    include: { menuItem: { include: { recipe: { include: { product: true } } } } },
  });

  const byItem = new Map<string, { name: string; category: string | null; qty: number; revenue: number; costPerUnit: number; hasRecipe: boolean }>();
  for (const s of sales) {
    const cost = computeRecipeCost(s.menuItem.recipe);
    const entry = byItem.get(s.menuItemId) ?? {
      name: s.menuItem.name,
      category: s.menuItem.category,
      qty: 0,
      revenue: 0,
      costPerUnit: cost,
      hasRecipe: s.menuItem.recipe.length > 0,
    };
    entry.qty += s.quantity;
    entry.revenue += s.revenue;
    byItem.set(s.menuItemId, entry);
  }

  return Array.from(byItem.entries())
    .map(([id, e]) => {
      const totalCost = e.hasRecipe ? e.qty * e.costPerUnit : 0;
      return {
        id,
        name: e.name,
        category: e.category,
        qty: e.qty,
        revenue: e.revenue,
        cost: totalCost,
        margin: e.revenue - totalCost,
        marginPct: e.revenue > 0 && e.hasRecipe ? ((e.revenue - totalCost) / e.revenue) * 100 : null,
        hasRecipe: e.hasRecipe,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getLaborCostForMonth(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const rows = await prisma.laborCost.findMany({ where: { restaurantId, date: { gte: start, lt: end } } });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  return { total, byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })), rows };
}

export async function getWasteForMonth(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const rows = await prisma.wasteEntry.findMany({
    where: { restaurantId, date: { gte: start, lt: end } },
    include: { product: true },
    orderBy: { date: "desc" },
  });
  const total = rows.reduce((s, r) => s + r.estimatedCost, 0);
  return { total, rows };
}

/** Revenue by day-of-week across every recorded day — answers "which day does best". */
export async function getDayOfWeekPattern(restaurantId: string) {
  const rows = await prisma.dailySales.findMany({
    where: { restaurantId },
    select: { date: true, dineInRevenue: true, deliveryRevenue: true, takeawayRevenue: true, otherRevenue: true, covers: true },
  });
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = DAYS.map((label) => ({ label, revenue: 0, covers: 0, days: 0 }));
  for (const r of rows) {
    const d = byDay[r.date.getDay()];
    d.revenue += r.dineInRevenue + r.deliveryRevenue + r.takeawayRevenue + r.otherRevenue;
    d.covers += r.covers;
    d.days += 1;
  }
  return byDay.map((d) => ({ ...d, avgRevenue: d.days > 0 ? d.revenue / d.days : 0 }));
}

/**
 * Naive linear projection over the trailing months of a {month, amount} series.
 * Least-squares fit on whatever history exists (2-12 points) — indicative only,
 * not a real forecasting model. Returns null when there isn't enough history
 * to fit a line (fewer than 2 months).
 */
export function projectNextValue(
  series: { month: string; amount: number }[],
): { nextMonth: string; projected: number; basedOnMonths: number } | null {
  const trailing = series.slice(-12);
  if (trailing.length < 2) return null;

  const n = trailing.length;
  const xs = trailing.map((_, i) => i);
  const ys = trailing.map((t) => t.amount);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const projected = Math.max(0, intercept + slope * n);

  const [y, m] = trailing[trailing.length - 1].month.split("-").map(Number);
  const next = new Date(y, m, 1); // m is 1-based already, so this lands on next month
  const nextMonth = monthKey(next);

  return { nextMonth, projected, basedOnMonths: n };
}

export async function getProfitAndLoss(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const [sales, menuPerf, labor, otherOpexLines, waste, cashOpex] = await Promise.all([
    getSalesForMonth(restaurantId, month),
    getMenuItemPerformance(restaurantId, month),
    getLaborCostForMonth(restaurantId, month),
    prisma.billLineItem.findMany({
      where: {
        bill: { restaurantId, date: { gte: start, lt: end }, type: "INVOICE" },
        product: { category: { in: NON_FOOD_CATEGORIES } },
      },
      select: { amount: true },
    }),
    getWasteForMonth(restaurantId, month),
    getOperatingExpenseTotal(restaurantId, month),
  ]);

  const revenue = sales.totalRevenue;
  const cogs = menuPerf.reduce((s, m) => s + m.cost, 0);
  const itemsWithRecipe = menuPerf.filter((m) => m.hasRecipe).length;
  // Non-food bill lines plus cash/statement expenses (rent-like, repairs, transport...).
  const otherOpex = otherOpexLines.reduce((s, l) => s + l.amount, 0) + cashOpex;
  const laborCost = labor.total;
  const grossProfit = revenue - cogs;
  const operatingProfit = grossProfit - laborCost - otherOpex;

  return {
    month,
    revenue,
    cogs,
    grossProfit,
    laborCost,
    otherOpex,
    wasteCost: waste.total,
    operatingProfit,
    foodCostPct: revenue > 0 ? (cogs / revenue) * 100 : null,
    laborCostPct: revenue > 0 ? (laborCost / revenue) * 100 : null,
    itemsWithRecipe,
    totalMenuItemsSold: menuPerf.length,
  };
}

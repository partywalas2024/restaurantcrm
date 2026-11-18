// Read model for product consumption.
//
// Bills only say what was BOUGHT. To see what was actually USED, four
// independent signals are put side by side per product and per month:
//
//   purchased  — bill line items (invoices minus returns)
//   used       — staff-logged usage (InventoryMovement type CONSUMPTION)
//   wasted     — WasteEntry rows
//   expected   — what recipes say the month's sales should have consumed
//                (MenuItemSale quantity x RecipeIngredient quantity)
//   countVar   — physical stock-count variance (counted - system); negative
//                means stock that vanished without being logged
//
// Nothing here is estimated silently: each number comes from one of those
// sources, and the "days of stock left" figure says which source it used.

import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/format";
import { autoRecipeLabel, isAutoRecipeNote } from "@/lib/auto-consumption";

export type ConsumptionFlag = "SHRINKAGE" | "OVER_USE" | "UNDER_LOGGED" | "OK";
export const FLAG_META: Record<ConsumptionFlag, { label: string; tone: "ok" | "warn" | "crit" | "info"; hint: string }> = {
  SHRINKAGE: { label: "Stock missing", tone: "crit", hint: "A physical count found less than the books said — recount or check theft/waste." },
  OVER_USE: { label: "Over recipe", tone: "warn", hint: "Used + wasted is more than 15% above what the recipes expect (manual extras or rich portions)." },
  UNDER_LOGGED: { label: "Below recipe", tone: "info", hint: "Recipes expect more than was deducted — check incomplete recipes or missing item-wise sales." },
  OK: { label: "On track", tone: "ok", hint: "Auto + manual use is in line with recipes." },
};

export type RateBasis = "logged" | "recipes" | "purchases";

const DAY_MS = 24 * 60 * 60 * 1000;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

/** Recipe-expected usage per product for [start, end), from items actually sold in that window. */
async function expectedByProduct(restaurantId: string, start: Date, end: Date, onlyProductId?: string) {
  const [recipes, sales] = await Promise.all([
    prisma.recipeIngredient.findMany({
      where: { menuItem: { restaurantId }, ...(onlyProductId ? { productId: onlyProductId } : {}) },
      select: { productId: true, menuItemId: true, quantity: true },
    }),
    prisma.menuItemSale.findMany({
      where: { dailySales: { restaurantId, date: { gte: start, lt: end } } },
      select: { menuItemId: true, quantity: true },
    }),
  ]);
  const sold = new Map<string, number>();
  for (const s of sales) addTo(sold, s.menuItemId, s.quantity);
  const expected = new Map<string, number>();
  for (const r of recipes) addTo(expected, r.productId, r.quantity * (sold.get(r.menuItemId) ?? 0));
  return expected;
}

function classify(p: { usedQty: number; wastedQty: number; expectedQty: number; countVariance: number }): ConsumptionFlag {
  if (p.countVariance < -0.009) return "SHRINKAGE";
  const recorded = p.usedQty + p.wastedQty;
  if (p.expectedQty > 0 && recorded > p.expectedQty * 1.15) return "OVER_USE";
  if (p.expectedQty > 0 && recorded < p.expectedQty * 0.5) return "UNDER_LOGGED";
  return "OK";
}

export async function getConsumptionOverview(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS);
  const since90 = new Date(now - 90 * DAY_MS);

  const [products, lines, usage, waste, counts, expected, usage30, waste30, expected30, lines90] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId },
      select: { id: true, name: true, category: true, unit: true, currentStock: true, reorderLevel: true, lastCostPrice: true },
      orderBy: { name: "asc" },
    }),
    prisma.billLineItem.findMany({
      where: { bill: { restaurantId, date: { gte: start, lt: end } } },
      select: { productId: true, quantity: true, amount: true, bill: { select: { type: true } } },
    }),
    prisma.inventoryMovement.findMany({
      where: { product: { restaurantId }, type: "CONSUMPTION", date: { gte: start, lt: end } },
      select: { productId: true, quantity: true },
    }),
    prisma.wasteEntry.findMany({ where: { restaurantId, date: { gte: start, lt: end } }, select: { productId: true, quantity: true } }),
    prisma.stockCount.findMany({ where: { restaurantId, date: { gte: start, lt: end } }, select: { productId: true, variance: true } }),
    expectedByProduct(restaurantId, start, end),
    prisma.inventoryMovement.findMany({
      where: { product: { restaurantId }, type: "CONSUMPTION", date: { gte: since30 } },
      select: { productId: true, quantity: true },
    }),
    prisma.wasteEntry.findMany({ where: { restaurantId, date: { gte: since30 } }, select: { productId: true, quantity: true } }),
    expectedByProduct(restaurantId, since30, new Date(now + DAY_MS)),
    prisma.billLineItem.findMany({
      where: { bill: { restaurantId, date: { gte: since90 } } },
      select: { productId: true, quantity: true, bill: { select: { type: true } } },
    }),
  ]);

  const purchasedQty = new Map<string, number>();
  const purchaseSpend = new Map<string, number>();
  for (const l of lines) {
    const sign = l.bill.type === "RETURN" ? -1 : 1;
    addTo(purchasedQty, l.productId, sign * l.quantity);
    addTo(purchaseSpend, l.productId, sign * l.amount);
  }
  const used = new Map<string, number>();
  for (const m of usage) addTo(used, m.productId, -m.quantity); // stored negative
  const wasted = new Map<string, number>();
  for (const w of waste) addTo(wasted, w.productId, w.quantity);
  const variance = new Map<string, number>();
  for (const c of counts) addTo(variance, c.productId, c.variance);

  const used30 = new Map<string, number>();
  for (const m of usage30) addTo(used30, m.productId, -m.quantity);
  for (const w of waste30) addTo(used30, w.productId, w.quantity);
  const bought90 = new Map<string, number>();
  for (const l of lines90) addTo(bought90, l.productId, (l.bill.type === "RETURN" ? -1 : 1) * l.quantity);

  const rows = products
    .map((p) => {
      const pq = purchasedQty.get(p.id) ?? 0;
      const ps = purchaseSpend.get(p.id) ?? 0;
      const usedQty = used.get(p.id) ?? 0;
      const wastedQty = wasted.get(p.id) ?? 0;
      const expectedQty = expected.get(p.id) ?? 0;
      const countVariance = variance.get(p.id) ?? 0;

      // Current burn rate, preferring real logged usage over inference.
      let dailyRate: number | null = null;
      let rateBasis: RateBasis | null = null;
      const loggedRecent = used30.get(p.id) ?? 0;
      const recipeRecent = expected30.get(p.id) ?? 0;
      const boughtRecent = bought90.get(p.id) ?? 0;
      if (loggedRecent > 0) { dailyRate = loggedRecent / 30; rateBasis = "logged"; }
      else if (recipeRecent > 0) { dailyRate = recipeRecent / 30; rateBasis = "recipes"; }
      else if (boughtRecent > 0) { dailyRate = boughtRecent / 90; rateBasis = "purchases"; }
      const daysLeft = dailyRate && dailyRate > 0 ? Math.max(0, p.currentStock) / dailyRate : null;

      return {
        ...p,
        purchasedQty: pq,
        purchaseSpend: ps,
        avgRate: pq > 0 ? ps / pq : null,
        usedQty,
        wastedQty,
        expectedQty,
        countVariance,
        flag: classify({ usedQty, wastedQty, expectedQty, countVariance }),
        dailyRate,
        rateBasis,
        daysLeft,
      };
    })
    // Hide products with nothing going on this month and nothing on the shelf.
    .filter((r) => r.purchasedQty !== 0 || r.usedQty > 0 || r.wastedQty > 0 || r.expectedQty > 0 || r.countVariance !== 0 || r.currentStock > 0);

  const lossValue = rows.reduce((s, r) => s + (r.countVariance < 0 ? -r.countVariance * r.lastCostPrice : 0), 0);
  return {
    rows,
    totals: {
      purchaseSpend: rows.reduce((s, r) => s + r.purchaseSpend, 0),
      flagged: rows.filter((r) => r.flag !== "OK").length,
      shrinkage: rows.filter((r) => r.flag === "SHRINKAGE").length,
      lossValue,
      runningLow: rows.filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length,
    },
  };
}

export async function getProductConsumption(restaurantId: string, productId: string, monthsBack = 12) {
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId },
    include: { vendor: { select: { name: true } } },
  });
  if (!product) return null;

  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
  const keys: string[] = [];
  for (let i = 0; i < monthsBack; i++) keys.push(monthKey(new Date(first.getFullYear(), first.getMonth() + i, 1)));

  const [lines, usage, waste, counts, expected] = await Promise.all([
    prisma.billLineItem.findMany({
      where: { productId, bill: { restaurantId, date: { gte: first } } },
      select: { quantity: true, rate: true, amount: true, unit: true, bill: { select: { id: true, billNumber: true, date: true, type: true, vendor: { select: { name: true } } } } },
      orderBy: { bill: { date: "desc" } },
    }),
    prisma.inventoryMovement.findMany({ where: { productId, type: "CONSUMPTION", date: { gte: first } }, orderBy: { date: "desc" } }),
    prisma.wasteEntry.findMany({ where: { restaurantId, productId, date: { gte: first } }, select: { date: true, quantity: true } }),
    prisma.stockCount.findMany({ where: { restaurantId, productId, date: { gte: first } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    // Expected usage month by month for just this product.
    (async () => {
      const recipes = await prisma.recipeIngredient.findMany({ where: { productId, menuItem: { restaurantId } }, select: { menuItemId: true, quantity: true } });
      if (recipes.length === 0) return new Map<string, number>();
      const sales = await prisma.menuItemSale.findMany({
        where: { menuItemId: { in: recipes.map((r) => r.menuItemId) }, dailySales: { restaurantId, date: { gte: first } } },
        select: { menuItemId: true, quantity: true, dailySales: { select: { date: true } } },
      });
      const per = new Map<string, number>();
      const qtyPerServing = new Map(recipes.map((r) => [r.menuItemId, r.quantity]));
      for (const s of sales) addTo(per, monthKey(s.dailySales.date), s.quantity * (qtyPerServing.get(s.menuItemId) ?? 0));
      return per;
    })(),
  ]);

  const monthly = keys.map((month) => {
    const mLines = lines.filter((l) => monthKey(l.bill.date) === month);
    const sign = (t: string) => (t === "RETURN" ? -1 : 1);
    const purchasedQty = mLines.reduce((s, l) => s + sign(l.bill.type) * l.quantity, 0);
    const spend = mLines.reduce((s, l) => s + sign(l.bill.type) * l.amount, 0);
    const usedQty = usage.filter((m) => monthKey(m.date) === month).reduce((s, m) => s - m.quantity, 0);
    const wastedQty = waste.filter((w) => monthKey(w.date) === month).reduce((s, w) => s + w.quantity, 0);
    const countVariance = counts.filter((c) => monthKey(c.date) === month).reduce((s, c) => s + c.variance, 0);
    const expectedQty = expected.get(month) ?? 0;
    return {
      month,
      purchasedQty,
      spend,
      avgRate: purchasedQty > 0 ? spend / purchasedQty : null,
      usedQty,
      wastedQty,
      expectedQty,
      countVariance,
      flag: classify({ usedQty, wastedQty, expectedQty, countVariance }),
    };
  });

  const priceHistory = lines
    .filter((l) => l.bill.type === "INVOICE")
    .slice(0, 15)
    .map((l) => ({ billId: l.bill.id, billNumber: l.bill.billNumber, date: l.bill.date, vendor: l.bill.vendor.name, quantity: l.quantity, unit: l.unit, rate: l.rate }));

  const rates = lines.filter((l) => l.bill.type === "INVOICE").map((l) => l.rate);

  return {
    product,
    monthly,
    usage: usage.slice(0, 25).map((m) => ({
      id: m.id,
      date: m.date,
      quantity: -m.quantity,
      notes: isAutoRecipeNote(m.notes) ? autoRecipeLabel(m.notes) : m.notes,
      isAuto: isAutoRecipeNote(m.notes),
    })),
    counts: counts.slice(0, 25),
    priceHistory,
    priceRange: rates.length > 0 ? { min: Math.min(...rates), max: Math.max(...rates) } : null,
    totals: {
      purchasedQty: monthly.reduce((s, m) => s + m.purchasedQty, 0),
      spend: monthly.reduce((s, m) => s + m.spend, 0),
      usedQty: monthly.reduce((s, m) => s + m.usedQty, 0),
      wastedQty: monthly.reduce((s, m) => s + m.wastedQty, 0),
      expectedQty: monthly.reduce((s, m) => s + m.expectedQty, 0),
      countVariance: monthly.reduce((s, m) => s + m.countVariance, 0),
    },
  };
}

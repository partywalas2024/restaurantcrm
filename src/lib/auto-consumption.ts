// Hybrid consumption: when item-wise sales are saved, deduct stock from
// recipes automatically. Manual "Log Usage" and physical counts still work —
// counts correct reality; manual usage covers extras / non-recipe products.
//
// Auto rows are tagged in InventoryMovement.notes as AUTO_RECIPE:<dailySalesId>
// so a re-save or delete of that sales day can reverse and re-apply cleanly
// without touching manual usage entries.

import "server-only";

import { prisma } from "@/lib/prisma";

export const AUTO_RECIPE_PREFIX = "AUTO_RECIPE:";

export function autoRecipeNote(dailySalesId: string) {
  return `${AUTO_RECIPE_PREFIX}${dailySalesId}`;
}

export function isAutoRecipeNote(notes: string | null | undefined): boolean {
  return Boolean(notes?.startsWith(AUTO_RECIPE_PREFIX));
}

export function autoRecipeLabel(notes: string | null | undefined): string {
  if (!isAutoRecipeNote(notes)) return notes ?? "";
  return "Recipe auto from sales";
}

function roundQty(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Undo stock deductions previously applied for this sales day. */
export async function reverseRecipeConsumptionForDay(restaurantId: string, dailySalesId: string) {
  const note = autoRecipeNote(dailySalesId);
  const moves = await prisma.inventoryMovement.findMany({
    where: {
      type: "CONSUMPTION",
      notes: note,
      product: { restaurantId },
    },
    select: { id: true, productId: true, quantity: true },
  });
  if (moves.length === 0) return { reversed: 0 };

  await prisma.$transaction(async (tx) => {
    for (const m of moves) {
      // quantity is stored negative; putting stock back means subtracting that (i.e. adding).
      await tx.product.update({
        where: { id: m.productId },
        data: { currentStock: { increment: -m.quantity } },
      });
      await tx.inventoryMovement.delete({ where: { id: m.id } });
    }
  });

  return { reversed: moves.length };
}

/**
 * Replace auto recipe consumption for one DailySales day with what current
 * MenuItemSale × RecipeIngredient implies. No-op when there are no item sales
 * or no recipes (PetPooja summary-only days stay untouched).
 */
export async function applyRecipeConsumptionForDay(restaurantId: string, dailySalesId: string) {
  const day = await prisma.dailySales.findFirst({
    where: { id: dailySalesId, restaurantId },
    select: {
      id: true,
      date: true,
      items: { select: { menuItemId: true, quantity: true } },
    },
  });
  if (!day) return { applied: 0, products: 0 };

  await reverseRecipeConsumptionForDay(restaurantId, dailySalesId);

  if (day.items.length === 0) return { applied: 0, products: 0 };

  const menuItemIds = [...new Set(day.items.map((i) => i.menuItemId))];
  const recipes = await prisma.recipeIngredient.findMany({
    where: { menuItemId: { in: menuItemIds }, menuItem: { restaurantId } },
    select: { menuItemId: true, productId: true, quantity: true },
  });
  if (recipes.length === 0) return { applied: 0, products: 0 };

  const sold = new Map<string, number>();
  for (const i of day.items) sold.set(i.menuItemId, (sold.get(i.menuItemId) ?? 0) + i.quantity);

  const byProduct = new Map<string, number>();
  for (const r of recipes) {
    const qtySold = sold.get(r.menuItemId) ?? 0;
    if (qtySold <= 0) continue;
    byProduct.set(r.productId, (byProduct.get(r.productId) ?? 0) + r.quantity * qtySold);
  }

  const note = autoRecipeNote(dailySalesId);
  let products = 0;

  await prisma.$transaction(async (tx) => {
    for (const [productId, rawQty] of byProduct) {
      const qty = roundQty(rawQty);
      if (qty <= 0) continue;
      const owned = await tx.product.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
      if (!owned) continue;
      await tx.product.update({
        where: { id: productId },
        data: { currentStock: { increment: -qty } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId,
          type: "CONSUMPTION",
          quantity: -qty,
          date: day.date,
          notes: note,
        },
      });
      products++;
    }
  });

  return { applied: 1, products };
}

/** Apply (or refresh) auto consumption for every sales day that has item rows. */
export async function backfillRecipeConsumption(restaurantId: string) {
  const days = await prisma.dailySales.findMany({
    where: { restaurantId, items: { some: {} } },
    select: { id: true },
    orderBy: { date: "asc" },
  });

  let daysApplied = 0;
  let productsTouched = 0;
  for (const d of days) {
    const result = await applyRecipeConsumptionForDay(restaurantId, d.id);
    if (result.products > 0) {
      daysApplied++;
      productsTouched += result.products;
    }
  }
  return { daysScanned: days.length, daysApplied, productsTouched };
}

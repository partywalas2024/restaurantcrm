// Server actions for the revenue side — menu items, recipes, daily sales,
// labor and waste.
//
// Staff (USER) can only add; changing or deleting an existing record is
// Owner-only (`requireRestaurantAdmin()`).
//
// Like the purchase-side actions, every entry point re-checks the session via
// `requireRestaurantUser()` — server actions are reachable independently of
// the pages that render them, and this is also the tenant boundary: every
// mutation is scoped to the caller's own restaurant, and every update/delete
// re-verifies the target row belongs to it first.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser, requireRestaurantAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { normalizeProductName } from "@/lib/normalize";
import { inferCategory } from "@/lib/categories";
import type { LaborCategory } from "@/generated/prisma/enums";

function revalidateSalesPages() {
  revalidatePath("/sales");
  revalidatePath("/menu");
  revalidatePath("/profitability");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export type MenuFormState = { error?: string };

/**
 * Creates a dish and its whole recipe in one go. Ingredients are existing
 * products, or — so a recipe doesn't have to wait for the first purchase — new
 * ones typed in by name (created with zero stock and zero cost; the cost fills
 * in from the first bill that matches the same normalized name).
 */
export async function createMenuItemWithRecipe(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  const user = await requireRestaurantUser();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);

  if (!name) return { error: "Give the dish a name." };
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return { error: "Selling price must be zero or more." };

  const existingNames = await prisma.menuItem.findMany({ where: { restaurantId: user.restaurantId }, select: { name: true } });
  const key = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const clash = existingNames.find((m) => key(m.name) === key(name));
  if (clash) return { error: `"${clash.name}" is already on the menu. Open it from Menu & Recipes to change its recipe.` };

  const productIds = formData.getAll("productId").map(String);
  const newNames = formData.getAll("newName").map(String);
  const newUnits = formData.getAll("newUnit").map(String);
  const quantities = formData.getAll("quantity").map((q) => Number(q));

  type Line = { productId: string | null; newName: string; newUnit: string; quantity: number };
  const lines: Line[] = [];
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i] || null;
    const newName = (newNames[i] ?? "").trim();
    if (!productId && !newName) continue; // blank row left behind
    const quantity = quantities[i];
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `Enter a quantity above zero for "${newName || "each ingredient"}".` };
    lines.push({ productId, newName, newUnit: (newUnits[i] ?? "").trim(), quantity });
  }

  const owned = await prisma.product.findMany({
    where: { restaurantId: user.restaurantId },
    select: { id: true, name: true, unit: true },
  });
  const byId = new Map(owned.map((p) => [p.id, p]));
  const byNormalized = new Map(owned.map((p) => [normalizeProductName(p.name), p]));

  const resolved: { productId: string | null; create: { name: string; unit: string } | null; unit: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.productId) {
      const p = byId.get(l.productId);
      if (!p) return { error: "One of the ingredients doesn't exist any more — reload the page and pick it again." };
      if (seen.has(p.id)) return { error: `"${p.name}" is listed twice — add it once with the combined quantity.` };
      seen.add(p.id);
      resolved.push({ productId: p.id, create: null, unit: p.unit, quantity: l.quantity });
    } else {
      const normalized = normalizeProductName(l.newName);
      const match = byNormalized.get(normalized);
      if (match) {
        if (seen.has(match.id)) return { error: `"${match.name}" is listed twice — add it once with the combined quantity.` };
        seen.add(match.id);
        resolved.push({ productId: match.id, create: null, unit: match.unit, quantity: l.quantity });
      } else {
        if (!l.newUnit) return { error: `Enter a unit (KG, L, PCS...) for the new ingredient "${l.newName}".` };
        if (seen.has(`new:${normalized}`)) return { error: `"${l.newName}" is listed twice — add it once with the combined quantity.` };
        seen.add(`new:${normalized}`);
        resolved.push({ productId: null, create: { name: normalized, unit: l.newUnit.toUpperCase() }, unit: l.newUnit.toUpperCase(), quantity: l.quantity });
      }
    }
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.menuItem.create({ data: { restaurantId: user.restaurantId, name, category, sellingPrice } });
    for (const r of resolved) {
      let productId = r.productId;
      if (!productId && r.create) {
        const product = await tx.product.create({
          data: { restaurantId: user.restaurantId, name: r.create.name, unit: r.create.unit, category: inferCategory(r.create.name) },
        });
        productId = product.id;
      }
      await tx.recipeIngredient.create({ data: { menuItemId: created.id, productId: productId!, quantity: r.quantity, unit: r.unit } });
    }
    return created;
  });

  const newCount = resolved.filter((r) => r.create).length;
  await logActivity(
    user,
    "CREATE",
    "MenuItem",
    item.id,
    `Added menu item ${name} (Rs. ${sellingPrice.toFixed(2)}) with ${resolved.length} ingredient(s)${newCount ? `, ${newCount} new` : ""}`,
  );
  revalidateSalesPages();
  revalidatePath("/products");
  redirect(`/menu/${item.id}`);
}

export async function updateMenuItem(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const category = (formData.get("category") as string | null) || null;
  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);
  const active = formData.get("active") === "on";

  const existing = await prisma.menuItem.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Menu item not found.");

  await prisma.menuItem.update({ where: { id }, data: { name, category, sellingPrice, active } });
  revalidateSalesPages();
  revalidatePath(`/menu/${id}`);
}

export async function deleteMenuItem(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.menuItem.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Menu item not found.");
  await prisma.menuItem.delete({ where: { id } });
  revalidateSalesPages();
  redirect("/menu");
}

export async function addRecipeIngredient(formData: FormData) {
  const user = await requireRestaurantUser();
  const menuItemId = String(formData.get("menuItemId"));
  const productId = String(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Pick an ingredient and enter a positive quantity.");
  }
  const [menuItem, product] = await Promise.all([
    prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId: user.restaurantId } }),
    prisma.product.findFirst({ where: { id: productId, restaurantId: user.restaurantId } }),
  ]);
  if (!menuItem || !product) throw new Error("Menu item or product not found.");

  await prisma.recipeIngredient.create({ data: { menuItemId, productId, quantity, unit } });
  revalidatePath(`/menu/${menuItemId}`);
  revalidateSalesPages();
}

export async function removeRecipeIngredient(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const menuItemId = String(formData.get("menuItemId"));
  const existing = await prisma.recipeIngredient.findFirst({ where: { id, menuItem: { restaurantId: user.restaurantId } } });
  if (!existing) throw new Error("Recipe ingredient not found.");
  await prisma.recipeIngredient.delete({ where: { id } });
  revalidatePath(`/menu/${menuItemId}`);
  revalidateSalesPages();
}

/** Creates or updates the single DailySales row for a date, plus any per-item quantities sold that day. */
export async function saveDailySales(formData: FormData) {
  const user = await requireRestaurantUser();
  const dateStr = String(formData.get("date"));
  const date = new Date(dateStr);

  const dineInRevenue = Number(formData.get("dineInRevenue") || 0);
  const deliveryRevenue = Number(formData.get("deliveryRevenue") || 0);
  const takeawayRevenue = Number(formData.get("takeawayRevenue") || 0);
  const otherRevenue = Number(formData.get("otherRevenue") || 0);
  const cashAmount = Number(formData.get("cashAmount") || 0);
  const upiAmount = Number(formData.get("upiAmount") || 0);
  const cardAmount = Number(formData.get("cardAmount") || 0);
  const otherPaymentAmount = Number(formData.get("otherPaymentAmount") || 0);
  const covers = Number(formData.get("covers") || 0);
  const notes = (formData.get("notes") as string | null) || null;

  if (user.role !== "RESTAURANT_ADMIN") {
    const already = await prisma.dailySales.findUnique({ where: { restaurantId_date: { restaurantId: user.restaurantId, date } } });
    if (already) throw new Error("Sales for this date already exist — only the owner can change them.");
  }

  const dailySales = await prisma.dailySales.upsert({
    where: { restaurantId_date: { restaurantId: user.restaurantId, date } },
    update: {
      dineInRevenue,
      deliveryRevenue,
      takeawayRevenue,
      otherRevenue,
      cashAmount,
      upiAmount,
      cardAmount,
      otherPaymentAmount,
      covers,
      notes,
      source: "MANUAL",
    },
    create: {
      restaurantId: user.restaurantId,
      date,
      dineInRevenue,
      deliveryRevenue,
      takeawayRevenue,
      otherRevenue,
      cashAmount,
      upiAmount,
      cardAmount,
      otherPaymentAmount,
      covers,
      notes,
      source: "MANUAL",
    },
  });

  // Item-wise quantities come in as qty_<menuItemId> fields; only non-empty, positive entries are saved.
  const menuItems = await prisma.menuItem.findMany({ where: { restaurantId: user.restaurantId }, select: { id: true, sellingPrice: true } });
  const priceById = new Map(menuItems.map((m) => [m.id, m.sellingPrice]));

  await prisma.menuItemSale.deleteMany({ where: { dailySalesId: dailySales.id } });
  const itemRows: { dailySalesId: string; menuItemId: string; quantity: number; revenue: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const menuItemId = key.slice(4);
    if (!priceById.has(menuItemId)) continue; // not one of this restaurant's own menu items
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const price = priceById.get(menuItemId) ?? 0;
    itemRows.push({ dailySalesId: dailySales.id, menuItemId, quantity: qty, revenue: qty * price });
  }
  if (itemRows.length > 0) {
    await prisma.menuItemSale.createMany({ data: itemRows });
  }

  revalidateSalesPages();
  redirect("/sales");
}

export async function deleteDailySales(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.dailySales.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Sales record not found.");
  await prisma.dailySales.delete({ where: { id } });
  revalidateSalesPages();
}

export async function recordLaborCost(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const date = new Date(String(formData.get("date")));
  const category = formData.get("category") as LaborCategory;
  const amount = Number(formData.get("amount"));
  const notes = (formData.get("notes") as string | null) || null;

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");

  await prisma.laborCost.create({ data: { restaurantId: user.restaurantId, date, category, amount, notes } });
  revalidatePath("/labor");
  revalidateSalesPages();
}

export async function deleteLaborCost(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.laborCost.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Labor cost entry not found.");
  await prisma.laborCost.delete({ where: { id } });
  revalidatePath("/labor");
  revalidateSalesPages();
}

export async function recordWaste(formData: FormData) {
  const user = await requireRestaurantUser();
  const date = new Date(String(formData.get("date")));
  const productId = String(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const manualCost = formData.get("estimatedCost");
  const reason = (formData.get("reason") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Pick a product and enter a positive quantity.");
  }

  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId: user.restaurantId } });
  if (!product) throw new Error("Product not found.");

  // Default to quantity x last purchase cost — override only if the user typed a value.
  let estimatedCost = manualCost ? Number(manualCost) : 0;
  if (!estimatedCost) {
    estimatedCost = quantity * product.lastCostPrice;
  }

  await prisma.wasteEntry.create({ data: { restaurantId: user.restaurantId, date, productId, quantity, estimatedCost, reason, notes } });
  revalidatePath("/waste");
  revalidateSalesPages();
}

export async function deleteWaste(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.wasteEntry.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Waste entry not found.");
  await prisma.wasteEntry.delete({ where: { id } });
  revalidatePath("/waste");
  revalidateSalesPages();
}

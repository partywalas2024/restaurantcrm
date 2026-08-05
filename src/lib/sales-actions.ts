"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { LaborCategory } from "@/generated/prisma/enums";

function revalidateSalesPages() {
  revalidatePath("/sales");
  revalidatePath("/menu");
  revalidatePath("/profitability");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export async function createMenuItem(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Menu item name is required.");
  const category = (formData.get("category") as string | null) || null;
  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);

  const item = await prisma.menuItem.create({ data: { name, category, sellingPrice } });
  revalidateSalesPages();
  redirect(`/menu/${item.id}`);
}

export async function updateMenuItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const category = (formData.get("category") as string | null) || null;
  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);
  const active = formData.get("active") === "on";

  await prisma.menuItem.update({ where: { id }, data: { name, category, sellingPrice, active } });
  revalidateSalesPages();
  revalidatePath(`/menu/${id}`);
}

export async function deleteMenuItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.menuItem.delete({ where: { id } });
  revalidateSalesPages();
  redirect("/menu");
}

export async function addRecipeIngredient(formData: FormData) {
  await requireUser();
  const menuItemId = String(formData.get("menuItemId"));
  const productId = String(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "");

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Pick an ingredient and enter a positive quantity.");
  }

  await prisma.recipeIngredient.create({ data: { menuItemId, productId, quantity, unit } });
  revalidatePath(`/menu/${menuItemId}`);
  revalidateSalesPages();
}

export async function removeRecipeIngredient(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const menuItemId = String(formData.get("menuItemId"));
  await prisma.recipeIngredient.delete({ where: { id } });
  revalidatePath(`/menu/${menuItemId}`);
  revalidateSalesPages();
}

/** Creates or updates the single DailySales row for a date, plus any per-item quantities sold that day. */
export async function saveDailySales(formData: FormData) {
  await requireUser();
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

  const dailySales = await prisma.dailySales.upsert({
    where: { date },
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
  const menuItems = await prisma.menuItem.findMany({ select: { id: true, sellingPrice: true } });
  const priceById = new Map(menuItems.map((m) => [m.id, m.sellingPrice]));

  await prisma.menuItemSale.deleteMany({ where: { dailySalesId: dailySales.id } });
  const itemRows: { dailySalesId: string; menuItemId: string; quantity: number; revenue: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const menuItemId = key.slice(4);
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
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.dailySales.delete({ where: { id } });
  revalidateSalesPages();
}

export async function recordLaborCost(formData: FormData) {
  await requireUser();
  const date = new Date(String(formData.get("date")));
  const category = formData.get("category") as LaborCategory;
  const amount = Number(formData.get("amount"));
  const notes = (formData.get("notes") as string | null) || null;

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");

  await prisma.laborCost.create({ data: { date, category, amount, notes } });
  revalidatePath("/labor");
  revalidateSalesPages();
}

export async function deleteLaborCost(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.laborCost.delete({ where: { id } });
  revalidatePath("/labor");
  revalidateSalesPages();
}

export async function recordWaste(formData: FormData) {
  await requireUser();
  const date = new Date(String(formData.get("date")));
  const productId = String(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const manualCost = formData.get("estimatedCost");
  const reason = (formData.get("reason") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Pick a product and enter a positive quantity.");
  }

  // Default to quantity x last purchase cost — override only if the user typed a value.
  let estimatedCost = manualCost ? Number(manualCost) : 0;
  if (!estimatedCost) {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    estimatedCost = quantity * product.lastCostPrice;
  }

  await prisma.wasteEntry.create({ data: { date, productId, quantity, estimatedCost, reason, notes } });
  revalidatePath("/waste");
  revalidateSalesPages();
}

export async function deleteWaste(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  await prisma.wasteEntry.delete({ where: { id } });
  revalidatePath("/waste");
  revalidateSalesPages();
}

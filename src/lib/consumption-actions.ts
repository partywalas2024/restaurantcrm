// Server actions for consumption tracking.
//
// Staff can ADD usage entries and stock counts (that is how real consumption
// gets recorded). Removing a wrong entry is Owner-only and reverses its effect
// on stock, so the product's stock always equals the sum of its movements.

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser, requireRestaurantAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

function revalidateConsumption(productId: string) {
  revalidatePath("/consumption");
  revalidatePath(`/consumption/${productId}`);
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

/** Records stock used in the kitchen. Stock goes down; the movement is kept so it can be audited or undone. */
export async function logUsage(formData: FormData) {
  const user = await requireRestaurantUser();
  const productId = String(formData.get("productId"));
  const quantity = Number(formData.get("quantity"));
  const date = new Date(String(formData.get("date")));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity used must be a positive number.");
  if (Number.isNaN(date.getTime())) throw new Error("Pick a valid date.");

  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId: user.restaurantId } });
  if (!product) throw new Error("Product not found.");

  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { currentStock: { increment: -quantity } } }),
    prisma.inventoryMovement.create({ data: { productId, type: "CONSUMPTION", quantity: -quantity, date, notes } }),
  ]);
  await logActivity(user, "CREATE", "Consumption", productId, `Logged usage of ${quantity} ${product.unit} ${product.name}${notes ? ` — ${notes}` : ""}`);
  revalidateConsumption(productId);
}

/** Records a physical count: stock is set to what was counted and the gap versus the books is kept as variance. */
export async function recordStockCount(formData: FormData) {
  const user = await requireRestaurantUser();
  const productId = String(formData.get("productId"));
  const countedQty = Number(formData.get("countedQty"));
  const date = new Date(String(formData.get("date")));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!Number.isFinite(countedQty) || countedQty < 0) throw new Error("Counted quantity must be zero or more.");
  if (Number.isNaN(date.getTime())) throw new Error("Pick a valid date.");

  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId: user.restaurantId } });
  if (!product) throw new Error("Product not found.");

  const systemQty = product.currentStock;
  const variance = Math.round((countedQty - systemQty) * 1000) / 1000;

  await prisma.$transaction(async (tx) => {
    const movement = await tx.inventoryMovement.create({
      data: { productId, type: "ADJUSTMENT", quantity: variance, date, notes: `Physical count: ${countedQty} counted vs ${systemQty} on record${notes ? ` — ${notes}` : ""}` },
    });
    await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: variance } } });
    await tx.stockCount.create({
      data: { restaurantId: user.restaurantId, productId, date, countedQty, systemQty, variance, movementId: movement.id, notes },
    });
  });
  await logActivity(user, "CREATE", "StockCount", productId, `Counted ${product.name}: ${countedQty} ${product.unit} (books said ${systemQty}, variance ${variance >= 0 ? "+" : ""}${variance})`);
  revalidateConsumption(productId);
}

/** Owner: removes a wrong usage entry and puts the stock back. */
export async function deleteUsage(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const m = await prisma.inventoryMovement.findFirst({
    where: { id, type: "CONSUMPTION", product: { restaurantId: user.restaurantId } },
    include: { product: { select: { name: true, unit: true } } },
  });
  if (!m) throw new Error("Usage entry not found.");

  await prisma.$transaction([
    prisma.product.update({ where: { id: m.productId }, data: { currentStock: { increment: -m.quantity } } }),
    prisma.inventoryMovement.delete({ where: { id } }),
  ]);
  await logActivity(user, "DELETE", "Consumption", m.productId, `Removed usage entry of ${-m.quantity} ${m.product.unit} ${m.product.name}`);
  revalidateConsumption(m.productId);
}

/** Owner: removes a wrong stock count and undoes the adjustment it made. */
export async function deleteStockCount(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const c = await prisma.stockCount.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: { product: { select: { name: true, unit: true } } },
  });
  if (!c) throw new Error("Stock count not found.");

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: c.productId }, data: { currentStock: { increment: -c.variance } } });
    if (c.movementId) await tx.inventoryMovement.deleteMany({ where: { id: c.movementId } });
    await tx.stockCount.delete({ where: { id } });
  });
  await logActivity(user, "DELETE", "StockCount", c.productId, `Removed stock count of ${c.countedQty} ${c.product.unit} ${c.product.name}`);
  revalidateConsumption(c.productId);
}

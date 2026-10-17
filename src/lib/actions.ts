// Server actions for the purchase side — bills, products, vendors, payments,
// stock adjustments and the restaurant profile.
//
// Permission model: Staff (role USER) can only ADD — upload/enter bills, add
// vendors/products, record payments. Anything that changes or removes an
// existing record is Owner-only (`requireRestaurantAdmin()`), so a staff
// mistake or duplicate can only be corrected by the owner, and is logged.
//
// Each action re-checks the session with `requireRestaurantUser()`. That is
// not belt-and-braces: server actions are individually addressable HTTP
// endpoints, so the sign-in gate in proxy.ts does not protect them on its
// own, and `requireRestaurantUser()` is also the tenant boundary — every
// mutation below is scoped to the caller's own restaurant, and every
// update/delete re-verifies the target row actually belongs to it before
// touching it, rather than trusting an id from the form.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser, requireRestaurantAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { importBills, type ExtractedBill, type ExtractedItem } from "@/lib/import";
import type { PaymentMethod, PaymentStatus, ProductCategory } from "@/generated/prisma/enums";

export async function updateBill(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const paymentStatus = formData.get("paymentStatus") as PaymentStatus | null;
  const category = formData.get("category") as ProductCategory | null;
  const notes = formData.get("notes") as string | null;
  const billNumber = formData.get("billNumber") as string | null;
  const dateRaw = String(formData.get("date") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const newDate = dateRaw ? new Date(dateRaw) : null;
  if (newDate && Number.isNaN(newDate.getTime())) throw new Error("Invalid bill date.");

  const existing = await prisma.bill.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Bill not found.");

  const updated = await prisma.bill.update({
    where: { id },
    data: {
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(category ? { category } : {}),
      ...(notes !== null ? { notes } : {}),
      ...(billNumber ? { billNumber, isUncertain: false } : {}),
      ...(newDate ? { date: newDate } : {}),
      ...(formData.has("dueDate") ? { dueDate: dueDateRaw ? new Date(dueDateRaw) : null } : {}),
    },
  });
  // Stock movements carry the bill's date, so keep them in step.
  if (newDate) await prisma.inventoryMovement.updateMany({ where: { billId: id }, data: { date: newDate } });
  await logActivity(user, "UPDATE", "Bill", id, `Updated bill ${updated.billNumber}`);

  revalidatePath("/bills");
  revalidatePath(`/bills/${id}`);
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/analytics");
}

export async function updateProduct(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const category = formData.get("category") as ProductCategory | null;
  const reorderLevel = formData.get("reorderLevel");
  const currentStock = formData.get("currentStock");
  const unit = formData.get("unit") as string | null;
  const name = formData.get("name") as string | null;

  const existing = await prisma.product.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Product not found.");

  // A direct stock edit is recorded as an adjustment so stock always equals
  // the sum of its movements and the consumption report can explain it.
  const newStock = currentStock !== null && currentStock !== "" ? Number(currentStock) : null;
  if (newStock !== null && Number.isFinite(newStock) && newStock !== existing.currentStock) {
    await prisma.inventoryMovement.create({
      data: { productId: id, type: "ADJUSTMENT", quantity: newStock - existing.currentStock, date: new Date(), notes: `Owner edited stock ${existing.currentStock} -> ${newStock}` },
    });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(category ? { category } : {}),
      ...(reorderLevel !== null && reorderLevel !== "" ? { reorderLevel: Number(reorderLevel) } : {}),
      ...(newStock !== null && Number.isFinite(newStock) ? { currentStock: newStock } : {}),
      ...(unit ? { unit } : {}),
      ...(name ? { name, isUncertain: false } : {}),
    },
  });
  await logActivity(user, "UPDATE", "Product", id, `Updated product ${updated.name}`);

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export async function updateVendor(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const name = (formData.get("name") as string | null)?.trim();
  const phone = formData.get("phone") as string | null;
  const address = formData.get("address") as string | null;
  const gstin = formData.get("gstin") as string | null;
  const notes = formData.get("notes") as string | null;

  if (name !== undefined && name !== null && name === "") {
    throw new Error("Vendor name cannot be empty.");
  }

  const existing = await prisma.vendor.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Vendor not found.");

  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(phone !== null ? { phone } : {}),
      ...(address !== null ? { address } : {}),
      ...(gstin !== null ? { gstin } : {}),
      ...(notes !== null ? { notes } : {}),
    },
  });
  await logActivity(user, "UPDATE", "Vendor", id, `Updated vendor ${updated.name}`);

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  revalidatePath(`/vendors/${id}/edit`);
  revalidatePath("/");
  revalidatePath("/balance-sheet");
  redirect(`/vendors/${id}`);
}

export async function createVendor(formData: FormData) {
  const user = await requireRestaurantUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Vendor name is required.");
  const phone = (formData.get("phone") as string | null) || null;
  const address = (formData.get("address") as string | null) || null;
  const gstin = (formData.get("gstin") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  // Same normalized match the bill importer uses, so adding a vendor by hand
  // can't create a second account for a supplier that already exists under a
  // different capitalisation — scoped to this restaurant, since another
  // restaurant having a same-named vendor is not a collision at all.
  const key = name.toLowerCase().replace(/\s+/g, " ");
  const existing = await prisma.vendor.findMany({ where: { restaurantId: user.restaurantId }, select: { id: true, name: true } });
  const clash = existing.find((v) => v.name.trim().toLowerCase().replace(/\s+/g, " ") === key);
  if (clash) {
    redirect(`/vendors/${clash.id}?exists=${encodeURIComponent(clash.name)}`);
  }

  const vendor = await prisma.vendor.create({
    data: { restaurantId: user.restaurantId, name, phone, address, gstin, notes },
  });
  await logActivity(user, "CREATE", "Vendor", vendor.id, `Created vendor ${vendor.name}`);

  revalidatePath("/vendors");
  revalidatePath("/");
  redirect(`/vendors/${vendor.id}`);
}

export async function recordPayment(formData: FormData) {
  const user = await requireRestaurantUser();
  const vendorId = String(formData.get("vendorId"));
  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be a positive number.");
  }

  const payVendor = await prisma.vendor.findFirst({ where: { id: vendorId, restaurantId: user.restaurantId }, select: { name: true } });
  if (!payVendor) throw new Error("Vendor not found.");

  const payment = await prisma.payment.create({ data: { vendorId, date, amount, method, reference, notes } });
  await logActivity(user, "CREATE", "Payment", payment.id, `Recorded payment of Rs. ${amount.toFixed(2)} (${method}) to ${payVendor.name}`);

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/");
  revalidatePath("/balance-sheet");
}

export async function deletePayment(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const vendorId = String(formData.get("vendorId"));

  const existing = await prisma.payment.findFirst({ where: { id, vendor: { restaurantId: user.restaurantId } } });
  if (!existing) throw new Error("Payment not found.");
  const delVendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });

  await prisma.payment.delete({ where: { id } });
  await logActivity(user, "DELETE", "Payment", id, `Deleted payment of Rs. ${existing.amount.toFixed(2)} to ${delVendor?.name ?? vendorId}`);

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/");
  revalidatePath("/balance-sheet");
}

export async function adjustStock(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const productId = String(formData.get("productId"));
  const delta = Number(formData.get("delta"));
  const notes = (formData.get("notes") as string | null) ?? "";

  const product = await prisma.product.findFirst({ where: { id: productId, restaurantId: user.restaurantId } });
  if (!product) throw new Error("Product not found.");

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { currentStock: product.currentStock + delta },
    }),
    prisma.inventoryMovement.create({
      data: {
        productId,
        type: "ADJUSTMENT",
        quantity: delta,
        date: new Date(),
        notes: notes || `Manual adjustment (${delta >= 0 ? "+" : ""}${delta})`,
      },
    }),
  ]);
  await logActivity(user, "UPDATE", "Product", productId, `Adjusted stock for ${product.name}: ${delta >= 0 ? "+" : ""}${delta} ${product.unit}${notes ? ` — ${notes}` : ""}`);

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

// ---- Owner-only corrections: delete / edit wrong or duplicate records ----

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Point a product's "last cost" and "last purchase date" back at its newest remaining purchase. */
async function refreshProductCost(productId: string) {
  const latest = await prisma.billLineItem.findFirst({
    where: { productId, bill: { type: "INVOICE" } },
    orderBy: { bill: { date: "desc" } },
    include: { bill: { select: { date: true } } },
  });
  await prisma.product.update({
    where: { id: productId },
    data: latest ? { lastCostPrice: latest.rate, lastPurchaseDate: latest.bill.date } : { lastCostPrice: 0, lastPurchaseDate: null },
  });
}

function revalidatePurchasePages() {
  revalidatePath("/bills");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/consumption");
  revalidatePath("/vendors");
  revalidatePath("/expenses");
  revalidatePath("/balance-sheet");
  revalidatePath("/analytics");
  revalidatePath("/");
}

/** Deletes a whole bill (e.g. a duplicate upload) and reverses every stock movement it caused. */
export async function deleteBill(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));

  const bill = await prisma.bill.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: { lineItems: true, vendor: { select: { name: true } } },
  });
  if (!bill) throw new Error("Bill not found.");
  const sign = bill.type === "RETURN" ? -1 : 1;

  await prisma.$transaction(async (tx) => {
    for (const li of bill.lineItems) {
      await tx.product.update({ where: { id: li.productId }, data: { currentStock: { increment: -sign * li.quantity } } });
    }
    await tx.inventoryMovement.deleteMany({ where: { billId: id } });
    await tx.bill.delete({ where: { id } });
  });
  for (const productId of new Set(bill.lineItems.map((li) => li.productId))) await refreshProductCost(productId);

  await logActivity(user, "DELETE", "Bill", id, `Deleted bill ${bill.billNumber} (${bill.vendor.name}, Rs. ${bill.grandTotal.toFixed(2)}) and reversed its stock`);
  revalidatePurchasePages();
  redirect("/bills");
}

/** Fixes a wrong quantity / rate / unit on one bill line; stock, bill totals and last-cost follow. */
export async function updateBillLineItem(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("lineItemId"));
  const quantity = Number(formData.get("quantity"));
  const rate = Number(formData.get("rate"));
  const unit = String(formData.get("unit") ?? "").trim();
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be a positive number.");
  if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate must be zero or more.");

  const li = await prisma.billLineItem.findFirst({
    where: { id, bill: { restaurantId: user.restaurantId } },
    include: { bill: { include: { lineItems: true } } },
  });
  if (!li) throw new Error("Line item not found.");
  const bill = li.bill;
  const sign = bill.type === "RETURN" ? -1 : 1;
  const amount = round2(quantity * rate);
  const subtotal = round2(bill.lineItems.reduce((s, x) => s + (x.id === id ? amount : x.amount), 0));
  const grandTotal = round2(subtotal + bill.sgst + bill.cgst + bill.roundoff);

  await prisma.$transaction(async (tx) => {
    await tx.billLineItem.update({ where: { id }, data: { quantity, rate, amount, ...(unit ? { unit } : {}) } });
    await tx.product.update({ where: { id: li.productId }, data: { currentStock: { increment: sign * (quantity - li.quantity) } } });
    const movement = await tx.inventoryMovement.findFirst({
      where: { billId: bill.id, productId: li.productId, quantity: sign * li.quantity },
    });
    if (movement) await tx.inventoryMovement.update({ where: { id: movement.id }, data: { quantity: sign * quantity } });
    await tx.bill.update({ where: { id: bill.id }, data: { subtotal, grandTotal } });
  });
  await refreshProductCost(li.productId);

  await logActivity(user, "UPDATE", "Bill", bill.id, `Corrected line "${li.productNameRaw}" on bill ${bill.billNumber}: ${li.quantity} x ${li.rate} -> ${quantity} x ${rate}`);
  revalidatePurchasePages();
  revalidatePath(`/bills/${bill.id}`);
}

/** Removes one wrong/duplicate line from a bill. The last remaining line can't be removed — delete the bill instead. */
export async function deleteBillLineItem(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("lineItemId"));

  const li = await prisma.billLineItem.findFirst({
    where: { id, bill: { restaurantId: user.restaurantId } },
    include: { bill: { include: { lineItems: true } } },
  });
  if (!li) throw new Error("Line item not found.");
  const bill = li.bill;
  if (bill.lineItems.length <= 1) throw new Error("This is the only line on the bill — delete the whole bill instead.");
  const sign = bill.type === "RETURN" ? -1 : 1;
  const subtotal = round2(bill.lineItems.filter((x) => x.id !== id).reduce((s, x) => s + x.amount, 0));
  const grandTotal = round2(subtotal + bill.sgst + bill.cgst + bill.roundoff);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: li.productId }, data: { currentStock: { increment: -sign * li.quantity } } });
    const movement = await tx.inventoryMovement.findFirst({
      where: { billId: bill.id, productId: li.productId, quantity: sign * li.quantity },
    });
    if (movement) await tx.inventoryMovement.delete({ where: { id: movement.id } });
    await tx.billLineItem.delete({ where: { id } });
    await tx.bill.update({ where: { id: bill.id }, data: { subtotal, grandTotal } });
  });
  await refreshProductCost(li.productId);

  await logActivity(user, "DELETE", "Bill", bill.id, `Removed line "${li.productNameRaw}" (${li.quantity} ${li.unit}) from bill ${bill.billNumber}`);
  revalidatePurchasePages();
  revalidatePath(`/bills/${bill.id}`);
}

/** Deletes a vendor with no bills or payments (e.g. a duplicate). Otherwise explains what's blocking it. */
export async function deleteVendor(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const vendor = await prisma.vendor.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: { _count: { select: { bills: true, payments: true } } },
  });
  if (!vendor) throw new Error("Vendor not found.");
  if (vendor._count.bills > 0 || vendor._count.payments > 0) {
    redirect(`/vendors/${id}?error=${encodeURIComponent(`Can't delete ${vendor.name}: it has ${vendor._count.bills} bill(s) and ${vendor._count.payments} payment(s). Delete those first.`)}`);
  }
  await prisma.product.updateMany({ where: { vendorId: id }, data: { vendorId: null } });
  await prisma.vendor.delete({ where: { id } });
  await logActivity(user, "DELETE", "Vendor", id, `Deleted vendor ${vendor.name}`);
  revalidatePurchasePages();
  redirect("/vendors");
}

/** Deletes a product that was never purchased or used in a recipe/waste entry (e.g. a mis-scanned duplicate name). */
export async function deleteProduct(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const product = await prisma.product.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: { _count: { select: { lineItems: true, recipeUses: true, wasteEntries: true } } },
  });
  if (!product) throw new Error("Product not found.");
  const c = product._count;
  if (c.lineItems > 0 || c.recipeUses > 0 || c.wasteEntries > 0) {
    redirect(`/products/${id}?error=${encodeURIComponent(`Can't delete ${product.name}: it appears on ${c.lineItems} bill line(s), ${c.recipeUses} recipe(s) and ${c.wasteEntries} waste entr${c.wasteEntries === 1 ? "y" : "ies"}. Delete or correct those first.`)}`);
  }
  await prisma.inventoryMovement.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
  await logActivity(user, "DELETE", "Product", id, `Deleted product ${product.name}`);
  revalidatePurchasePages();
  redirect("/products");
}

/** Restaurant profile edits (address, GSTIN...) are admin-level, same as user management. */
export async function updateRestaurantProfile(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Restaurant name is required.");
  const address = (formData.get("address") as string | null) || null;
  const phone = (formData.get("phone") as string | null) || null;
  const gstin = (formData.get("gstin") as string | null) || null;

  await prisma.restaurant.update({
    where: { id: user.restaurantId },
    data: { name, address, phone, gstin },
  });
  await logActivity(user, "UPDATE", "Restaurant", user.restaurantId, `Updated restaurant profile (${name})`);

  revalidatePath("/", "layout");
}

/**
 * Creates a bill entered by hand.
 *
 * Routed through `importBills` — the same path the upload flow uses — so a
 * manual bill produces identical records: the vendor is reused or created,
 * products are matched on their normalized name, stock moves, and the ledger
 * updates. Entering one by hand and scanning one should be indistinguishable
 * afterwards.
 */
export async function createManualBill(formData: FormData) {
  const user = await requireRestaurantUser();

  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!vendorName) throw new Error("Vendor is required.");
  if (!billNumber) throw new Error("Bill number is required.");
  if (!date) throw new Error("Bill date is required.");

  const num = (key: string) => {
    const raw = formData.get(key);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  // Line items arrive as parallel arrays (itemName[], itemQty[], ...).
  const names = formData.getAll("itemName").map(String);
  const units = formData.getAll("itemUnit").map(String);
  const hsns = formData.getAll("itemHsn").map(String);
  const qtys = formData.getAll("itemQty").map((v) => Number(v) || 0);
  const rates = formData.getAll("itemRate").map((v) => Number(v) || 0);

  const items: ExtractedItem[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i]?.trim();
    if (!name) continue; // skip blank rows the user left behind
    items.push({
      name,
      unit: units[i]?.trim() || "PCS",
      hsn: hsns[i]?.trim() || undefined,
      qty: qtys[i],
      rate: rates[i],
      amount: Math.round(qtys[i] * rates[i] * 100) / 100,
    });
  }
  if (items.length === 0) throw new Error("Add at least one line item.");

  const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const sgst = num("sgst");
  const cgst = num("cgst");
  const roundoff = num("roundoff");
  const grandTotal = Math.round((subtotal + sgst + cgst + roundoff) * 100) / 100;

  const bill: ExtractedBill = {
    billNumber,
    type: formData.get("type") === "RETURN" ? "RETURN" : "INVOICE",
    date,
    dueDate: String(formData.get("dueDate") ?? "").trim() || undefined,
    subtotal,
    sgst,
    cgst,
    roundoff,
    grandTotal,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    items,
  };

  const result = await importBills(
    user.restaurantId,
    {
      name: vendorName,
      phone: String(formData.get("vendorPhone") ?? "").trim() || undefined,
      gstin: String(formData.get("vendorGstin") ?? "").trim() || undefined,
    },
    [bill],
    "manual entry",
  );
  await logActivity(user, "CREATE", "Bill", null, `Entered bill ${billNumber} manually for ${result.vendor.name} (Rs. ${grandTotal.toFixed(2)})`);

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/inventory");
  revalidatePath("/vendors");
  revalidatePath("/analytics");
  redirect("/bills");
}

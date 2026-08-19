// Server actions for the purchase side — bills, products, vendors, payments,
// stock adjustments and the restaurant profile.
//
// Each action re-checks the session with `requireUser()`. That is not
// belt-and-braces: server actions are individually addressable HTTP endpoints,
// so the sign-in gate in proxy.ts does not protect them on its own.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { importBills, type ExtractedBill, type ExtractedItem } from "@/lib/import";
import type { PaymentMethod, PaymentStatus, ProductCategory } from "@/generated/prisma/enums";

export async function updateBill(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const paymentStatus = formData.get("paymentStatus") as PaymentStatus | null;
  const category = formData.get("category") as ProductCategory | null;
  const notes = formData.get("notes") as string | null;
  const billNumber = formData.get("billNumber") as string | null;

  await prisma.bill.update({
    where: { id },
    data: {
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(category ? { category } : {}),
      ...(notes !== null ? { notes } : {}),
      ...(billNumber ? { billNumber, isUncertain: false } : {}),
    },
  });

  revalidatePath("/bills");
  revalidatePath(`/bills/${id}`);
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/analytics");
}

export async function updateProduct(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const category = formData.get("category") as ProductCategory | null;
  const reorderLevel = formData.get("reorderLevel");
  const currentStock = formData.get("currentStock");
  const unit = formData.get("unit") as string | null;
  const name = formData.get("name") as string | null;

  await prisma.product.update({
    where: { id },
    data: {
      ...(category ? { category } : {}),
      ...(reorderLevel !== null && reorderLevel !== "" ? { reorderLevel: Number(reorderLevel) } : {}),
      ...(currentStock !== null && currentStock !== "" ? { currentStock: Number(currentStock) } : {}),
      ...(unit ? { unit } : {}),
      ...(name ? { name, isUncertain: false } : {}),
    },
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/analytics");
}

export async function updateVendor(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const name = (formData.get("name") as string | null)?.trim();
  const phone = formData.get("phone") as string | null;
  const address = formData.get("address") as string | null;
  const gstin = formData.get("gstin") as string | null;
  const notes = formData.get("notes") as string | null;

  if (name !== undefined && name !== null && name === "") {
    throw new Error("Vendor name cannot be empty.");
  }

  await prisma.vendor.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(phone !== null ? { phone } : {}),
      ...(address !== null ? { address } : {}),
      ...(gstin !== null ? { gstin } : {}),
      ...(notes !== null ? { notes } : {}),
    },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  revalidatePath(`/vendors/${id}/edit`);
  revalidatePath("/");
  revalidatePath("/balance-sheet");
  redirect(`/vendors/${id}`);
}

export async function createVendor(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Vendor name is required.");
  const phone = (formData.get("phone") as string | null) || null;
  const address = (formData.get("address") as string | null) || null;
  const gstin = (formData.get("gstin") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  const vendor = await prisma.vendor.create({
    data: { name, phone, address, gstin, notes },
  });

  revalidatePath("/vendors");
  revalidatePath("/");
  redirect(`/vendors/${vendor.id}`);
}

export async function recordPayment(formData: FormData) {
  await requireUser();
  const vendorId = String(formData.get("vendorId"));
  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string | null) || null;
  const notes = (formData.get("notes") as string | null) || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be a positive number.");
  }

  await prisma.payment.create({
    data: { vendorId, date, amount, method, reference, notes },
  });

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/");
  revalidatePath("/balance-sheet");
}

export async function deletePayment(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const vendorId = String(formData.get("vendorId"));

  await prisma.payment.delete({ where: { id } });

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
  revalidatePath("/");
  revalidatePath("/balance-sheet");
}

export async function adjustStock(formData: FormData) {
  await requireUser();
  const productId = String(formData.get("productId"));
  const delta = Number(formData.get("delta"));
  const notes = (formData.get("notes") as string | null) ?? "";

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

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

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

export async function updateRestaurantProfile(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Restaurant name is required.");
  const address = (formData.get("address") as string | null) || null;
  const phone = (formData.get("phone") as string | null) || null;
  const gstin = (formData.get("gstin") as string | null) || null;

  await prisma.restaurantProfile.upsert({
    where: { id: "default" },
    update: { name, address, phone, gstin },
    create: { id: "default", name, address, phone, gstin },
  });

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
  await requireUser();

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

  await importBills(
    {
      name: vendorName,
      phone: String(formData.get("vendorPhone") ?? "").trim() || undefined,
      gstin: String(formData.get("vendorGstin") ?? "").trim() || undefined,
    },
    [bill],
    "manual entry",
  );

  revalidatePath("/bills");
  revalidatePath("/");
  revalidatePath("/expenses");
  revalidatePath("/inventory");
  revalidatePath("/vendors");
  revalidatePath("/analytics");
  redirect("/bills");
}

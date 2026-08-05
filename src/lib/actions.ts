"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
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

import { prisma } from "@/lib/prisma";
import { normalizeProductName } from "@/lib/normalize";
import { inferCategory } from "@/lib/categories";

export type ExtractedItem = {
  name: string;
  unit: string;
  hsn?: string;
  qty: number;
  rate: number;
  amount: number;
};

export type ExtractedBill = {
  billNumber: string;
  billNumberUncertain?: boolean;
  type: "INVOICE" | "RETURN";
  date: string; // YYYY-MM-DD
  dueDate?: string;
  subtotal: number;
  sgst: number;
  cgst: number;
  roundoff: number;
  grandTotal: number;
  notes?: string;
  items: ExtractedItem[];
};

export type ExtractedVendor = {
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
};

export async function importBills(
  vendorInfo: ExtractedVendor,
  bills: ExtractedBill[],
  sourceFile?: string
) {
  const vendor = await prisma.vendor.upsert({
    where: { name: vendorInfo.name },
    update: {},
    create: {
      name: vendorInfo.name,
      phone: vendorInfo.phone,
      address: vendorInfo.address,
      gstin: vendorInfo.gstin,
    },
  });

  const productCache = new Map<string, string>(); // normalized name -> product id
  let billsCreated = 0;
  let lineItemsCreated = 0;

  const sorted = [...bills].sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const bill of sorted) {
    const date = new Date(bill.date);
    const dueDate = bill.dueDate ? new Date(bill.dueDate) : null;
    const sign = bill.type === "RETURN" ? -1 : 1;

    const createdBill = await prisma.bill.create({
      data: {
        billNumber: bill.billNumber,
        billNumberRaw: bill.billNumber,
        type: bill.type,
        date,
        dueDate,
        vendorId: vendor.id,
        subtotal: bill.subtotal,
        sgst: bill.sgst,
        cgst: bill.cgst,
        roundoff: bill.roundoff,
        grandTotal: bill.grandTotal,
        paymentStatus: "UNKNOWN",
        notes: bill.notes || null,
        isUncertain: Boolean(bill.billNumberUncertain),
        sourceFile: sourceFile ?? null,
      },
    });
    billsCreated++;

    // Dominant category for the bill = highest-spend category among its items.
    const categorySpend = new Map<string, number>();

    for (const item of bill.items) {
      const normalized = normalizeProductName(item.name);
      let productId = productCache.get(normalized);

      if (!productId) {
        const existing = await prisma.product.findUnique({ where: { name: normalized } });
        if (existing) {
          productId = existing.id;
        } else {
          const category = inferCategory(normalized);
          const created = await prisma.product.create({
            data: {
              name: normalized,
              category,
              unit: item.unit,
              hsn: item.hsn || null,
              vendorId: vendor.id,
            },
          });
          productId = created.id;
        }
        productCache.set(normalized, productId);
      }

      await prisma.billLineItem.create({
        data: {
          billId: createdBill.id,
          productId,
          productNameRaw: item.name,
          unit: item.unit,
          hsn: item.hsn || null,
          quantity: item.qty,
          rate: item.rate,
          amount: item.amount,
        },
      });
      lineItemsCreated++;

      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      const category = product.category;
      categorySpend.set(category, (categorySpend.get(category) ?? 0) + item.amount);

      const updateData: Record<string, unknown> = {
        currentStock: product.currentStock + sign * item.qty,
      };
      if (bill.type === "INVOICE" && (!product.lastPurchaseDate || date >= product.lastPurchaseDate)) {
        updateData.lastCostPrice = item.rate;
        updateData.lastPurchaseDate = date;
        if (product.reorderLevel === 0) {
          // Seed a sensible default reorder level so low-stock alerts aren't
          // meaningless on day one — ~1/4 of a single purchase quantity.
          updateData.reorderLevel = Math.max(1, Math.round(item.qty * 0.25));
        }
      }
      await prisma.product.update({ where: { id: productId }, data: updateData });

      await prisma.inventoryMovement.create({
        data: {
          productId,
          billId: createdBill.id,
          type: bill.type === "RETURN" ? "RETURN" : "PURCHASE",
          quantity: sign * item.qty,
          date,
        },
      });
    }

    const topCategory = [...categorySpend.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      await prisma.bill.update({
        where: { id: createdBill.id },
        data: { category: topCategory[0] as never },
      });
    }
  }

  return { vendor, billsCreated, lineItemsCreated };
}

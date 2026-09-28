// Turns extracted bill data into database rows.
//
// Shared by the OpenAI upload flow and the one-off seed script, so both paths
// produce identical records. Products are matched on a normalized name, which
// is what lets the same item spelled differently across bills accumulate into
// one inventory line rather than fragmenting into near-duplicates.

import { prisma } from "@/lib/prisma";
import { normalizeProductName } from "@/lib/normalize";
import { inferCategory } from "@/lib/categories";
// Re-exported so server-side callers can keep importing it from here.
export { checkBill } from "@/lib/bill-check";

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
  /**
   * Arithmetic problems found by `checkBill()` after extraction. Advisory only —
   * they are shown for review and never stored, since a bill that genuinely
   * doesn't add up should still be enterable once a human has looked at it.
   */
  warnings?: string[];
};

export type ExtractedVendor = {
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
};


/**
 * Vendor names as printed vary in case and spacing between bills — the same
 * supplier arrived once as "Shanker Lal Suresh Kumar" and once as
 * "SHANKER LAL SURESH KUMAR", which an exact-match upsert turned into two
 * accounts with a split ledger. Matching on a normalized form keeps one
 * supplier as one account.
 */
function vendorKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveVendor(restaurantId: string, info: ExtractedVendor) {
  const key = vendorKey(info.name);
  const existing = await prisma.vendor.findMany({
    where: { restaurantId },
    select: { id: true, name: true, phone: true, address: true, gstin: true },
  });
  const match = existing.find((v) => vendorKey(v.name) === key);

  if (!match) {
    return prisma.vendor.create({
      data: {
        restaurantId,
        name: info.name.trim(),
        phone: info.phone,
        address: info.address,
        gstin: info.gstin,
      },
    });
  }

  // Fill in details this bill supplies that the existing record is missing,
  // without overwriting anything already recorded.
  const fill: { phone?: string; address?: string; gstin?: string } = {};
  if (!match.phone && info.phone) fill.phone = info.phone;
  if (!match.address && info.address) fill.address = info.address;
  if (!match.gstin && info.gstin) fill.gstin = info.gstin;

  if (Object.keys(fill).length > 0) {
    return prisma.vendor.update({ where: { id: match.id }, data: fill });
  }
  return prisma.vendor.findUniqueOrThrow({ where: { id: match.id } });
}

export async function importBills(
  restaurantId: string,
  vendorInfo: ExtractedVendor,
  bills: ExtractedBill[],
  sourceFile?: string
) {
  const vendor = await resolveVendor(restaurantId, vendorInfo);

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
        restaurantId,
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
        const existing = await prisma.product.findFirst({ where: { name: normalized, restaurantId } });
        if (existing) {
          productId = existing.id;
        } else {
          const category = inferCategory(normalized);
          const created = await prisma.product.create({
            data: {
              restaurantId,
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

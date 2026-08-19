// Turns extracted bill data into database rows.
//
// Shared by the OpenAI upload flow and the one-off seed script, so both paths
// produce identical records. Products are matched on a normalized name, which
// is what lets the same item spelled differently across bills accumulate into
// one inventory line rather than fragmenting into near-duplicates.

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


/**
 * Independent arithmetic check on an extracted bill.
 *
 * Reading a bill is inherently fallible — a smudged digit becomes a wrong
 * number in the books. Rather than trusting the transcription, we re-derive the
 * totals ourselves: line items must sum to the subtotal, and subtotal plus
 * taxes must equal the grand total. Anything that fails is surfaced for review.
 */
export function checkBill(bill: ExtractedBill): string[] {
  const warnings: string[] = [];
  const money = (n: number) =>
    `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // A rupee of slack absorbs per-line rounding on the printed bill.
  const TOLERANCE = 1;

  if (bill.items.length === 0) {
    warnings.push("No line items were read from this bill.");
  } else {
    const itemsSum = bill.items.reduce((s, i) => s + i.amount, 0);
    if (Math.abs(itemsSum - bill.subtotal) > TOLERANCE) {
      warnings.push(
        `Line items add up to ${money(itemsSum)} but the subtotal reads ${money(bill.subtotal)} — a difference of ${money(Math.abs(itemsSum - bill.subtotal))}.`,
      );
    }
  }

  const computedTotal = bill.subtotal + bill.sgst + bill.cgst + bill.roundoff;
  if (Math.abs(computedTotal - bill.grandTotal) > TOLERANCE) {
    warnings.push(
      `Subtotal plus taxes comes to ${money(computedTotal)} but the grand total reads ${money(bill.grandTotal)}.`,
    );
  }

  for (const item of bill.items) {
    const expected = item.qty * item.rate;
    if (Math.abs(expected - item.amount) > TOLERANCE) {
      warnings.push(
        `"${item.name}": ${item.qty} x ${money(item.rate)} should be ${money(expected)}, but the amount reads ${money(item.amount)}.`,
      );
    }
  }

  if (bill.billNumberUncertain) {
    warnings.push("The bill number was hard to read — check it against the paper copy.");
  }

  return warnings;
}

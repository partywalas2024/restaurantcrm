// Merges duplicate vendor records created before vendor matching became
// case-insensitive (e.g. "Shanker Lal Suresh Kumar" vs "SHANKER LAL SURESH
// KUMAR"), which split one supplier's ledger across two accounts.
//
//   npm run merge-vendors           # dry run — reports what it would do
//   npm run merge-vendors -- --apply
//
// The record with the most bills wins and keeps its name; the others hand over
// their bills, products and payments and are then deleted. Nothing is created
// or recalculated, so the combined ledger is simply the sum of the parts.

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { bills: true, payments: true, products: true } } },
  });

  const groups = new Map<string, typeof vendors>();
  for (const v of vendors) {
    const k = key(v.name);
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }

  const dupes = [...groups.values()].filter((g) => g.length > 1);
  if (dupes.length === 0) {
    console.log("No duplicate vendors found.");
    return;
  }

  console.log(APPLY ? "APPLYING MERGES\n" : "DRY RUN — nothing will be changed\n");

  for (const group of dupes) {
    // Keep whichever record already carries the most history.
    const sorted = [...group].sort((a, b) => b._count.bills - a._count.bills);
    const keep = sorted[0];
    const drop = sorted.slice(1);

    console.log(`Keeping: "${keep.name}"  (${keep._count.bills} bills, ${keep._count.payments} payments, ${keep._count.products} products)`);
    for (const d of drop) {
      console.log(`  merging in: "${d.name}"  (${d._count.bills} bills, ${d._count.payments} payments, ${d._count.products} products)`);
    }

    if (!APPLY) {
      console.log("");
      continue;
    }

    for (const d of drop) {
      await prisma.$transaction([
        prisma.bill.updateMany({ where: { vendorId: d.id }, data: { vendorId: keep.id } }),
        prisma.payment.updateMany({ where: { vendorId: d.id }, data: { vendorId: keep.id } }),
        prisma.product.updateMany({ where: { vendorId: d.id }, data: { vendorId: keep.id } }),
        // Carry over any detail the surviving record is missing.
        prisma.vendor.update({
          where: { id: keep.id },
          data: {
            phone: keep.phone ?? d.phone,
            address: keep.address ?? d.address,
            gstin: keep.gstin ?? d.gstin,
          },
        }),
        prisma.vendor.delete({ where: { id: d.id } }),
      ]);
      console.log(`  merged and removed "${d.name}"`);
    }

    const after = await prisma.vendor.findUniqueOrThrow({
      where: { id: keep.id },
      include: { _count: { select: { bills: true, payments: true, products: true } } },
    });
    console.log(`  result: "${after.name}" now has ${after._count.bills} bills, ${after._count.payments} payments, ${after._count.products} products\n`);
  }

  if (!APPLY) console.log("Re-run with --apply to perform these merges.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

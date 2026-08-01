import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { importBills, type ExtractedBill } from "../src/lib/import";
import { prisma } from "../src/lib/prisma";

const SCRATCH_DIR =
  "/private/tmp/claude-501/-Volumes-Gauravfeel-AI-Restaurant-CRM/f452e36c-239e-4434-98e1-dd58b76cc9ce/scratchpad";

const VENDOR = {
  name: "Shanker Lal Suresh Kumar",
  phone: "0141-4409640, 9887147926, 9529881169",
  address: "B-18B, Shiv Marg, Banipark, Jaipur",
  gstin: "08ABHPA4243R1ZE",
};

async function main() {
  const files = ["invoices-a.json", "invoices-b.json", "invoices-c.json"];
  const bills: ExtractedBill[] = [];

  for (const file of files) {
    const path = join(SCRATCH_DIR, file);
    const raw = JSON.parse(readFileSync(path, "utf-8")) as ExtractedBill[];
    // The batch-A/B transcription prompts omitted "type" per-bill (only
    // batch C's did) — every bill in those two batches is a tax invoice
    // (the one sales return, CN00007, is in batch C and already typed
    // correctly), so default missing types to INVOICE rather than re-running
    // those agents.
    for (const bill of raw) {
      if (!bill.type) bill.type = "INVOICE";
    }
    bills.push(...raw);
  }

  console.log(`Loaded ${bills.length} bills, ${bills.reduce((s, b) => s + b.items.length, 0)} line items`);

  // Clean slate so re-running the seed doesn't duplicate data.
  await prisma.inventoryMovement.deleteMany();
  await prisma.billLineItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.product.deleteMany();
  await prisma.vendor.deleteMany();

  const result = await importBills(VENDOR, bills, "bills.pdf");
  console.log(`Imported ${result.billsCreated} bills, ${result.lineItemsCreated} line items for ${result.vendor.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

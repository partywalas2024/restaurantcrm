import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyChannel, classifyPayment, type SalesField } from "@/lib/sales-import";

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = new Date(trimmed);
  if (!isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) return startOfDay(iso);

  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return startOfDay(d);
  }

  const generic = new Date(trimmed);
  return isNaN(generic.getTime()) ? null : startOfDay(generic);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseNumber(value: string): number {
  const cleaned = (value ?? "").replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    rows: Record<string, string>[];
    mapping: Partial<Record<SalesField, string>>;
  };
  const { rows, mapping } = body;

  if (!mapping.date || !mapping.itemName || !mapping.quantity || !mapping.amount) {
    return NextResponse.json({ error: "Date, Item Name, Quantity, and Amount must all be mapped." }, { status: 400 });
  }

  type ParsedRow = { date: Date; itemName: string; quantity: number; amount: number; orderType?: string; paymentMode?: string; orderId?: string };
  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const date = parseDate(row[mapping.date]);
    const itemName = row[mapping.itemName]?.trim();
    const quantity = parseNumber(row[mapping.quantity]);
    const amount = parseNumber(row[mapping.amount]);
    if (!date || !itemName || quantity <= 0) {
      skipped++;
      continue;
    }
    parsed.push({
      date,
      itemName,
      quantity,
      amount,
      orderType: mapping.orderType ? row[mapping.orderType] : undefined,
      paymentMode: mapping.paymentMode ? row[mapping.paymentMode] : undefined,
      orderId: mapping.orderId ? row[mapping.orderId] : undefined,
    });
  }

  const byDate = new Map<number, ParsedRow[]>();
  for (const r of parsed) {
    const key = r.date.getTime();
    const arr = byDate.get(key) ?? [];
    arr.push(r);
    byDate.set(key, arr);
  }

  let daysImported = 0;
  let itemSalesImported = 0;
  const menuItemCache = new Map<string, string>(); // normalized name -> id

  for (const [dateMs, dayRows] of byDate.entries()) {
    const date = new Date(dateMs);

    const revenue = { dineIn: 0, delivery: 0, takeaway: 0, other: 0 };
    const payment = { cash: 0, upi: 0, card: 0, other: 0 };
    const orderIds = new Set<string>();

    for (const r of dayRows) {
      revenue[classifyChannel(r.orderType)] += r.amount;
      payment[classifyPayment(r.paymentMode)] += r.amount;
      if (r.orderId) orderIds.add(r.orderId);
    }

    const dailySales = await prisma.dailySales.upsert({
      where: { date },
      update: {
        dineInRevenue: revenue.dineIn,
        deliveryRevenue: revenue.delivery,
        takeawayRevenue: revenue.takeaway,
        otherRevenue: revenue.other,
        cashAmount: payment.cash,
        upiAmount: payment.upi,
        cardAmount: payment.card,
        otherPaymentAmount: payment.other,
        covers: orderIds.size,
        source: "PETPOOJA_IMPORT",
      },
      create: {
        date,
        dineInRevenue: revenue.dineIn,
        deliveryRevenue: revenue.delivery,
        takeawayRevenue: revenue.takeaway,
        otherRevenue: revenue.other,
        cashAmount: payment.cash,
        upiAmount: payment.upi,
        cardAmount: payment.card,
        otherPaymentAmount: payment.other,
        covers: orderIds.size,
        source: "PETPOOJA_IMPORT",
      },
    });
    daysImported++;

    await prisma.menuItemSale.deleteMany({ where: { dailySalesId: dailySales.id } });

    const byItem = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const r of dayRows) {
      const key = r.itemName.toUpperCase();
      const entry = byItem.get(key) ?? { name: r.itemName, qty: 0, revenue: 0 };
      entry.qty += r.quantity;
      entry.revenue += r.amount;
      byItem.set(key, entry);
    }

    const itemRows: { dailySalesId: string; menuItemId: string; quantity: number; revenue: number }[] = [];
    for (const [key, entry] of byItem.entries()) {
      let menuItemId = menuItemCache.get(key);
      if (!menuItemId) {
        const existing = await prisma.menuItem.findUnique({ where: { name: entry.name } });
        if (existing) {
          menuItemId = existing.id;
        } else {
          const created = await prisma.menuItem.create({
            data: { name: entry.name, sellingPrice: entry.qty > 0 ? entry.revenue / entry.qty : 0 },
          });
          menuItemId = created.id;
        }
        menuItemCache.set(key, menuItemId);
      }
      itemRows.push({ dailySalesId: dailySales.id, menuItemId, quantity: entry.qty, revenue: entry.revenue });
    }

    if (itemRows.length > 0) {
      await prisma.menuItemSale.createMany({ data: itemRows });
      itemSalesImported += itemRows.length;
    }
  }

  return NextResponse.json({ daysImported, itemSalesImported, rowsSkipped: skipped, totalRowsProcessed: parsed.length });
}

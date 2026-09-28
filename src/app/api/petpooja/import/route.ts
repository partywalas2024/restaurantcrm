// Saves reviewed PetPooja day-records to DailySales — the confirm step of the
// report-sync flow. Only touches the aggregate revenue/payment/cover fields on
// DailySales; MenuItemSale is never touched here, because none of the three
// PetPooja reports this importer reads carry per-dish detail. Overwrites
// whatever was on that date before (source: "PETPOOJA_REPORTS"), since a
// freshly-exported report is the more authoritative figure for that day.

import { NextRequest, NextResponse } from "next/server";
import { apiRestaurantGuard } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";

type ImportDay = {
  date: string;
  dineInRevenue: number;
  deliveryRevenue: number;
  takeawayRevenue: number;
  otherRevenue: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  covers: number;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function POST(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  let body: { days: ImportDay[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (!Array.isArray(body.days) || body.days.length === 0) {
    return NextResponse.json({ error: "No days to import." }, { status: 400 });
  }

  const NUMERIC_FIELDS = [
    "dineInRevenue", "deliveryRevenue", "takeawayRevenue", "otherRevenue",
    "cashAmount", "upiAmount", "cardAmount", "otherPaymentAmount", "covers",
  ] as const;

  for (const d of body.days) {
    if (!d.date || Number.isNaN(new Date(d.date).getTime())) {
      return NextResponse.json({ error: `Invalid date: ${JSON.stringify(d.date)}` }, { status: 400 });
    }
    for (const field of NUMERIC_FIELDS) {
      if (!isFiniteNumber(d[field])) {
        return NextResponse.json({ error: `Invalid value for "${field}" on ${d.date}.` }, { status: 400 });
      }
    }
  }

  let daysImported = 0;
  for (const d of body.days) {
    const date = new Date(d.date);
    const data = {
      dineInRevenue: d.dineInRevenue,
      deliveryRevenue: d.deliveryRevenue,
      takeawayRevenue: d.takeawayRevenue,
      otherRevenue: d.otherRevenue,
      cashAmount: d.cashAmount,
      upiAmount: d.upiAmount,
      cardAmount: d.cardAmount,
      otherPaymentAmount: d.otherPaymentAmount,
      covers: d.covers,
      source: "PETPOOJA_REPORTS",
    };
    await prisma.dailySales.upsert({
      where: { restaurantId_date: { restaurantId: user.restaurantId, date } },
      update: data,
      create: { restaurantId: user.restaurantId, date, ...data },
    });
    daysImported++;
  }
  await logActivity(user, "IMPORT", "DailySales", null, `Synced ${daysImported} day(s) of sales from PetPooja reports`);

  return NextResponse.json({ daysImported });
}

// Single payment record as JSON, used to render a payment receipt PDF.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRestaurant } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { apiRestaurantGuard } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  const paymentId = req.nextUrl.searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "paymentId is required." }, { status: 400 });

  const [payment, restaurant] = await Promise.all([
    prisma.payment.findFirst({ where: { id: paymentId, vendor: { restaurantId: user.restaurantId } }, include: { vendor: true } }),
    getRestaurant(user.restaurantId),
  ]);
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  return NextResponse.json({
    payment: {
      id: payment.id,
      date: formatDate(payment.date),
      amount: payment.amount,
      method: PAYMENT_METHOD_LABELS[payment.method],
      reference: payment.reference,
      notes: payment.notes,
    },
    vendor: {
      name: payment.vendor.name,
      address: payment.vendor.address,
      gstin: payment.vendor.gstin,
    },
    restaurant: {
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      gstin: restaurant.gstin,
    },
  });
}

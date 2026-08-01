import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRestaurantProfile } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";

export async function GET(req: NextRequest) {
  const paymentId = req.nextUrl.searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "paymentId is required." }, { status: 400 });

  const [payment, restaurant] = await Promise.all([
    prisma.payment.findUnique({ where: { id: paymentId }, include: { vendor: true } }),
    getRestaurantProfile(),
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

// Saves the reviewed rows of a statement as expenses. Owner-only.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiRestaurantGuard } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { CATEGORY_LABELS } from "@/lib/categories";
import { parseStatementDate } from "@/lib/statement";
import type { PaymentMethod, ProductCategory } from "@/generated/prisma/enums";

const METHODS: PaymentMethod[] = ["BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"];

type Row = { date: string; description: string; amount: number; category: string; explanation?: string; reference?: string | null };

export async function POST(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;
  if (user.role !== "RESTAURANT_ADMIN") {
    return NextResponse.json({ error: "Only the owner can import a statement." }, { status: 403 });
  }

  let body: { fileName?: string; paymentMethod?: string; rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  if (rows.length > 1000) return NextResponse.json({ error: "Too many rows (max 1000)." }, { status: 400 });
  const paymentMethod = (METHODS as string[]).includes(body.paymentMethod ?? "") ? (body.paymentMethod as PaymentMethod) : "BANK_TRANSFER";
  const fileName = String(body.fileName ?? "statement").slice(0, 200);

  const clean: { date: Date; amount: number; category: ProductCategory; description: string; explanation: string | null; reference: string | null }[] = [];
  for (const [i, r] of rows.entries()) {
    const iso = parseStatementDate(String(r.date));
    const amount = Number(r.amount);
    const description = String(r.description ?? "").trim();
    if (!iso) return NextResponse.json({ error: `Row ${i + 1}: invalid date.` }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: `Row ${i + 1}: amount must be more than zero.` }, { status: 400 });
    if (description.length < 3) return NextResponse.json({ error: `Row ${i + 1}: add a description (at least 3 characters).` }, { status: 400 });
    if (!(r.category in CATEGORY_LABELS)) return NextResponse.json({ error: `Row ${i + 1}: choose a category.` }, { status: 400 });
    clean.push({
      date: new Date(`${iso}T00:00:00.000Z`),
      amount: Math.round(amount * 100) / 100,
      category: r.category as ProductCategory,
      description: description.slice(0, 200),
      explanation: String(r.explanation ?? "").trim().slice(0, 1000) || null,
      reference: r.reference ? String(r.reference).slice(0, 100) : null,
    });
  }

  const dates = clean.map((c) => c.date.getTime());
  const total = Math.round(clean.reduce((s, c) => s + c.amount, 0) * 100) / 100;

  const statement = await prisma.$transaction(async (tx) => {
    const st = await tx.expenseStatement.create({
      data: {
        restaurantId: user.restaurantId,
        fileName,
        importedByName: user.name,
        periodFrom: new Date(Math.min(...dates)),
        periodTo: new Date(Math.max(...dates)),
        transactionCount: clean.length,
        totalAmount: total,
      },
    });
    await tx.expense.createMany({
      data: clean.map((c) => ({
        restaurantId: user.restaurantId,
        ...c,
        paymentMethod,
        source: "STATEMENT",
        statementId: st.id,
        createdByName: user.name,
      })),
    });
    return st;
  });

  await logActivity(user, "IMPORT", "ExpenseStatement", statement.id, `Imported ${clean.length} expense(s) from statement "${fileName}" (Rs. ${total.toFixed(2)})`);
  for (const p of ["/expenses", "/expenses/cash", "/profitability", "/"]) revalidatePath(p);
  return NextResponse.json({ imported: clean.length, total });
}

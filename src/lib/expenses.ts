// Read model for cash & statement expenses (see the Expense model in
// prisma/schema.prisma for what belongs here versus in vendor bills).

import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/format";
import { NON_FOOD_CATEGORIES } from "@/lib/categories";
import type { ProductCategory } from "@/generated/prisma/enums";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

export async function getExpenseMonths(restaurantId: string): Promise<string[]> {
  const rows = await prisma.expense.findMany({ where: { restaurantId }, select: { date: true } });
  return Array.from(new Set(rows.map((r) => monthKey(r.date)))).sort().reverse();
}

export async function getExpensesForMonth(restaurantId: string, month: string) {
  const { start, end } = monthRange(month);
  const rows = await prisma.expense.findMany({
    where: { restaurantId, date: { gte: start, lt: end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const byCategory = new Map<ProductCategory, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const cash = rows.filter((r) => r.paymentMethod === "CASH").reduce((s, r) => s + r.amount, 0);
  const operating = rows.filter((r) => NON_FOOD_CATEGORIES.includes(r.category)).reduce((s, r) => s + r.amount, 0);
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    rows,
    total,
    cash,
    operating,
    topCategory: top ? { category: top[0], amount: top[1] } : null,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
  };
}

/** Sum of expenses that count as operating expense on the P&L (non-food categories). */
export async function getOperatingExpenseTotal(restaurantId: string, month: string): Promise<number> {
  const { start, end } = monthRange(month);
  const agg = await prisma.expense.aggregate({
    where: { restaurantId, date: { gte: start, lt: end }, category: { in: NON_FOOD_CATEGORIES } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function getExpenseById(restaurantId: string, id: string) {
  return prisma.expense.findFirst({ where: { id, restaurantId } });
}

export async function getStatementImports(restaurantId: string) {
  return prisma.expenseStatement.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: 20 });
}

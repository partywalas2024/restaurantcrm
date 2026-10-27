// Server actions for cash & statement expenses.
//
// Staff can ADD expenses (petty cash is entered at the till, not by the owner).
// Changing or deleting one — or undoing a whole statement import — is
// Owner-only, like every other correction in the app.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser, requireRestaurantAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { CATEGORY_LABELS } from "@/lib/categories";
import { monthKey } from "@/lib/format";
import type { PaymentMethod, ProductCategory } from "@/generated/prisma/enums";

export type ExpenseFormState = { error?: string; success?: string; n?: number };

const METHODS: PaymentMethod[] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function parseExpense(formData: FormData):
  | { error: string }
  | { data: { date: Date; amount: number; category: ProductCategory; paymentMethod: PaymentMethod; paidTo: string | null; description: string; explanation: string | null; reference: string | null } } {
  const date = new Date(String(formData.get("date") ?? ""));
  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "") as ProductCategory;
  const paymentMethod = String(formData.get("paymentMethod") ?? "CASH") as PaymentMethod;
  const description = String(formData.get("description") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim() || null;
  const paidTo = String(formData.get("paidTo") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;

  if (Number.isNaN(date.getTime())) return { error: "Pick a valid date." };
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { error: "The date can't be in the future." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be more than zero." };
  if (amount >= 100_000_000) return { error: "That amount looks too large — check the digits." };
  if (!(category in CATEGORY_LABELS)) return { error: "Choose a category." };
  if (!METHODS.includes(paymentMethod)) return { error: "Choose how it was paid." };
  if (description.length < 3) return { error: "Write a short description of what the money was spent on (at least 3 characters)." };
  if (description.length > 200) return { error: "Keep the description under 200 characters — put the detail in the explanation." };
  if (explanation && explanation.length > 1000) return { error: "The explanation is too long (1000 characters max)." };

  return { data: { date, amount: Math.round(amount * 100) / 100, category, paymentMethod, paidTo, description, explanation, reference } };
}

function revalidateExpensePages() {
  revalidatePath("/expenses");
  revalidatePath("/expenses/cash");
  revalidatePath("/profitability");
  revalidatePath("/");
}

export async function createExpense(_prev: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const user = await requireRestaurantUser();
  const parsed = parseExpense(formData);
  if ("error" in parsed) return { error: parsed.error };
  const d = parsed.data;

  const expense = await prisma.expense.create({
    data: { restaurantId: user.restaurantId, ...d, source: "MANUAL", createdByName: user.name },
  });
  await logActivity(user, "CREATE", "Expense", expense.id, `Added expense Rs. ${d.amount.toFixed(2)} — ${d.description} (${CATEGORY_LABELS[d.category]}, ${d.paymentMethod})`);
  revalidateExpensePages();
  return { success: `Saved: ${d.description} — Rs. ${d.amount.toFixed(2)}`, n: Date.now() };
}

export async function updateExpense(_prev: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const parsed = parseExpense(formData);
  if ("error" in parsed) return { error: parsed.error };
  const d = parsed.data;

  const existing = await prisma.expense.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) return { error: "Expense not found." };

  await prisma.expense.update({ where: { id }, data: d });
  await logActivity(user, "UPDATE", "Expense", id, `Edited expense "${existing.description}": Rs. ${existing.amount.toFixed(2)} -> Rs. ${d.amount.toFixed(2)}, "${d.description}"`);
  revalidateExpensePages();
  redirect(`/expenses/cash?month=${monthKey(d.date)}`);
}

export async function deleteExpense(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.expense.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Expense not found.");
  await prisma.expense.delete({ where: { id } });
  await logActivity(user, "DELETE", "Expense", id, `Deleted expense Rs. ${existing.amount.toFixed(2)} — ${existing.description}`);
  revalidateExpensePages();
  redirect(`/expenses/cash?month=${monthKey(existing.date)}`);
}

/** Undo a whole statement import (e.g. the wrong file) — removes every expense it created. */
export async function deleteStatementImport(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const st = await prisma.expenseStatement.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!st) throw new Error("Statement import not found.");
  await prisma.expenseStatement.delete({ where: { id } });
  await logActivity(user, "DELETE", "ExpenseStatement", id, `Removed statement import "${st.fileName}" and its ${st.transactionCount} expense(s) (Rs. ${st.totalAmount.toFixed(2)})`);
  revalidateExpensePages();
}

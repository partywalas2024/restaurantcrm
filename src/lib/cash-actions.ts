// Server actions for cash received (money IN that isn't a daily-sales entry).
// Staff can add; editing or deleting is Owner-only, like every correction.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser, requireRestaurantAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { RECEIPT_KIND_LABEL } from "@/lib/cashbook";

export type CashReceiptState = { error?: string; success?: string; n?: number };

function parseReceipt(formData: FormData):
  | { error: string }
  | { data: { date: Date; amount: number; kind: string; receivedFrom: string | null; description: string; explanation: string | null; reference: string | null } } {
  const date = new Date(String(formData.get("date") ?? ""));
  const amount = Number(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "OTHER");
  const description = String(formData.get("description") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim() || null;
  const receivedFrom = String(formData.get("receivedFrom") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;

  if (Number.isNaN(date.getTime())) return { error: "Pick a valid date." };
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { error: "The date can't be in the future." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be more than zero." };
  if (amount >= 100_000_000) return { error: "That amount looks too large — check the digits." };
  if (!(kind in RECEIPT_KIND_LABEL)) return { error: "Choose what kind of cash this was." };
  if (description.length < 3) return { error: "Write a short description of what this cash was for (at least 3 characters)." };
  if (description.length > 200) return { error: "Keep the description under 200 characters — put the detail in the explanation." };
  if (explanation && explanation.length > 1000) return { error: "The explanation is too long (1000 characters max)." };

  return { data: { date, amount: Math.round(amount * 100) / 100, kind, receivedFrom, description, explanation, reference } };
}

function revalidateCash() {
  revalidatePath("/cash");
}

export async function createCashReceipt(_prev: CashReceiptState, formData: FormData): Promise<CashReceiptState> {
  const user = await requireRestaurantUser();
  const parsed = parseReceipt(formData);
  if ("error" in parsed) return { error: parsed.error };
  const d = parsed.data;
  const r = await prisma.cashReceipt.create({ data: { restaurantId: user.restaurantId, ...d, createdByName: user.name } });
  await logActivity(user, "CREATE", "CashReceipt", r.id, `Cash received Rs. ${d.amount.toFixed(2)} — ${d.description} (${RECEIPT_KIND_LABEL[d.kind]})`);
  revalidateCash();
  return { success: `Saved: ${d.description} — Rs. ${d.amount.toFixed(2)} received`, n: Date.now() };
}

export async function updateCashReceipt(_prev: CashReceiptState, formData: FormData): Promise<CashReceiptState> {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const parsed = parseReceipt(formData);
  if ("error" in parsed) return { error: parsed.error };
  const d = parsed.data;
  const existing = await prisma.cashReceipt.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) return { error: "Cash receipt not found." };
  await prisma.cashReceipt.update({ where: { id }, data: d });
  await logActivity(user, "UPDATE", "CashReceipt", id, `Edited cash receipt "${existing.description}": Rs. ${existing.amount.toFixed(2)} -> Rs. ${d.amount.toFixed(2)}`);
  revalidateCash();
  redirect("/cash");
}

export async function deleteCashReceipt(formData: FormData) {
  const user = await requireRestaurantAdmin();
  const id = String(formData.get("id"));
  const existing = await prisma.cashReceipt.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Cash receipt not found.");
  await prisma.cashReceipt.delete({ where: { id } });
  await logActivity(user, "DELETE", "CashReceipt", id, `Deleted cash receipt Rs. ${existing.amount.toFixed(2)} — ${existing.description}`);
  revalidateCash();
  redirect("/cash");
}

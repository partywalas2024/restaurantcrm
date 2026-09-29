// Server actions for the guest CRM — customer profiles and manually-logged
// visits (see prisma/schema.prisma for why visits are manual, not
// POS-captured, at this phase).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

const PHONE_RE = /^[0-9+][0-9+\-() ]{6,19}$/;

function revalidateGuestPages() {
  revalidatePath("/guests");
}

export async function createCustomer(formData: FormData) {
  const user = await requireRestaurantUser();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = (String(formData.get("email") ?? "").trim() || null);
  const whatsappOptIn = formData.get("whatsappOptIn") === "on";
  const dietaryNotes = (String(formData.get("dietaryNotes") ?? "").trim() || null);
  const birthday = formData.get("birthday") ? new Date(String(formData.get("birthday"))) : null;
  const anniversary = formData.get("anniversary") ? new Date(String(formData.get("anniversary"))) : null;
  const notes = (String(formData.get("notes") ?? "").trim() || null);

  if (!name) throw new Error("Guest name is required.");
  if (!PHONE_RE.test(phone)) throw new Error("Enter a valid phone number.");

  const existing = await prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId: user.restaurantId, phone } } });
  if (existing) throw new Error(`A guest with phone ${phone} already exists (${existing.name}).`);

  const customer = await prisma.customer.create({
    data: { restaurantId: user.restaurantId, name, phone, email, whatsappOptIn, dietaryNotes, birthday, anniversary, notes },
  });
  await logActivity(user, "CREATE", "Customer", customer.id, `Added guest ${name} (${phone})`);
  revalidateGuestPages();
  redirect(`/guests/${customer.id}`);
}

export async function updateCustomer(formData: FormData) {
  const user = await requireRestaurantUser();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = (String(formData.get("email") ?? "").trim() || null);
  const whatsappOptIn = formData.get("whatsappOptIn") === "on";
  const dietaryNotes = (String(formData.get("dietaryNotes") ?? "").trim() || null);
  const birthday = formData.get("birthday") ? new Date(String(formData.get("birthday"))) : null;
  const anniversary = formData.get("anniversary") ? new Date(String(formData.get("anniversary"))) : null;
  const notes = (String(formData.get("notes") ?? "").trim() || null);

  if (!name) throw new Error("Guest name is required.");
  if (!PHONE_RE.test(phone)) throw new Error("Enter a valid phone number.");

  const existing = await prisma.customer.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Guest not found.");

  const phoneOwner = await prisma.customer.findUnique({ where: { restaurantId_phone: { restaurantId: user.restaurantId, phone } } });
  if (phoneOwner && phoneOwner.id !== id) throw new Error(`Phone ${phone} already belongs to ${phoneOwner.name}.`);

  await prisma.customer.update({ where: { id }, data: { name, phone, email, whatsappOptIn, dietaryNotes, birthday, anniversary, notes } });
  await logActivity(user, "UPDATE", "Customer", id, `Updated guest ${name}`);
  revalidateGuestPages();
  revalidatePath(`/guests/${id}`);
}

export async function deleteCustomer(formData: FormData) {
  const user = await requireRestaurantUser();
  const id = String(formData.get("id"));
  const existing = await prisma.customer.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Guest not found.");
  await prisma.customer.delete({ where: { id } });
  await logActivity(user, "DELETE", "Customer", id, `Deleted guest ${existing.name} (${existing.phone})`);
  revalidateGuestPages();
  redirect("/guests");
}

export async function logCustomerVisit(formData: FormData) {
  const user = await requireRestaurantUser();
  const customerId = String(formData.get("customerId"));
  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount") || 0);
  const covers = formData.get("covers") ? Number(formData.get("covers")) : null;
  const notes = (String(formData.get("notes") ?? "").trim() || null);

  if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be zero or a positive number.");

  const customer = await prisma.customer.findFirst({ where: { id: customerId, restaurantId: user.restaurantId } });
  if (!customer) throw new Error("Guest not found.");

  await prisma.customerVisit.create({
    data: { restaurantId: user.restaurantId, customerId, date, amount, covers, notes },
  });
  await logActivity(user, "CREATE", "CustomerVisit", customerId, `Logged a visit for ${customer.name} (${amount > 0 ? `₹${amount}` : "no charge"})`);
  revalidateGuestPages();
  revalidatePath(`/guests/${customerId}`);
}

export async function deleteCustomerVisit(formData: FormData) {
  const user = await requireRestaurantUser();
  const id = String(formData.get("id"));
  const existing = await prisma.customerVisit.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!existing) throw new Error("Visit not found.");
  await prisma.customerVisit.delete({ where: { id } });
  await logActivity(user, "DELETE", "CustomerVisit", existing.customerId, "Removed a logged visit");
  revalidateGuestPages();
  revalidatePath(`/guests/${existing.customerId}`);
}

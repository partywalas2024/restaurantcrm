// Server actions for authentication and user administration.
//
// Sign-in deliberately returns one generic failure message for every cause
// (unknown user, wrong password, deactivated account) so the form cannot be
// used to enumerate valid usernames, and repeated failures lock the account
// briefly.
//
// Two separate admin surfaces:
//   - Restaurant-admin actions (create/update/reset/delete a USER or
//     RESTAURANT_ADMIN) are scoped to the acting admin's own restaurant, and
//     guard against removing the last active RESTAURANT_ADMIN within it.
//   - Platform actions (create a restaurant + its first admin, activate/
//     deactivate a restaurant) are SUPER_ADMIN only and never touch a
//     restaurant's business data.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  createSession,
  destroySession,
  hashPassword,
  requireRestaurantAdmin,
  requireSuperAdmin,
  requireUser,
  validatePassword,
  verifyPassword,
} from "./auth";
import { logActivity } from "./activity-log";

export type FormState = { error?: string; success?: string };

// ---- Brute-force throttle ----
// In-memory is enough here: a single PM2 process serves the app, and the state
// only needs to outlive a burst of guesses, not a restart.

const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function throttleCheck(key: string): number | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60000) : null;
}

function recordFailure(key: string) {
  const entry = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  attempts.set(key, entry);
}

function clearFailures(key: string) {
  attempts.delete(key);
}

function normalizeUsername(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

/** Only same-site paths, so `?next=` can't be used as an open redirect. */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

// ---- Sign in / out ----

export async function signInAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const username = normalizeUsername(formData.get("username"));
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter both your username and password." };
  }

  const lockedMinutes = throttleCheck(username);
  if (lockedMinutes !== null) {
    return {
      error: `Too many failed attempts. Try again in ${lockedMinutes} minute(s).`,
    };
  }

  const user = await prisma.user.findUnique({ where: { username } });

  // One message for every failure mode, so the form can't be used to discover
  // which usernames exist.
  const invalid = { error: "Incorrect username or password." };

  if (!user || !user.isActive) {
    recordFailure(username);
    return invalid;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    recordFailure(username);
    return invalid;
  }

  clearFailures(username);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user);

  redirect(safeRedirectTarget(formData.get("next")));
}

export async function signOutAction() {
  await destroySession();
  redirect("/signin");
}

// ---- Restaurant admin: manage this restaurant's own team ----

export async function createUserAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRestaurantAdmin();

  const username = normalizeUsername(formData.get("username"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = formData.get("role") === "RESTAURANT_ADMIN" ? "RESTAURANT_ADMIN" : "USER";
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_RE.test(username)) {
    return {
      error:
        "Username must be 3–32 characters, using only letters, numbers, dot, underscore or hyphen.",
    };
  }
  if (!name) return { error: "Full name is required." };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `Username "${username}" is already taken.` };

  const created = await prisma.user.create({
    data: {
      username,
      name,
      email: email || null,
      role,
      restaurantId: admin.restaurantId,
      passwordHash: await hashPassword(password),
    },
  });
  await logActivity(admin, "CREATE", "User", created.id, `Created user @${username} (${name}, ${role})`);

  revalidatePath("/users");
  redirect("/users?created=" + encodeURIComponent(username));
}

export async function updateUserAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRestaurantAdmin();
  const id = String(formData.get("id") ?? "");

  const target = await prisma.user.findFirst({ where: { id, restaurantId: admin.restaurantId } });
  if (!target) return { error: "User not found." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = formData.get("role") === "RESTAURANT_ADMIN" ? "RESTAURANT_ADMIN" : "USER";
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Full name is required." };

  // Guard rails against locking this restaurant's team out of its own CRM.
  if (target.id === admin.id && (role !== "RESTAURANT_ADMIN" || !isActive)) {
    return { error: "You cannot remove your own admin access." };
  }
  if (target.role === "RESTAURANT_ADMIN" && (role !== "RESTAURANT_ADMIN" || !isActive)) {
    const otherAdmins = await prisma.user.count({
      where: { role: "RESTAURANT_ADMIN", restaurantId: admin.restaurantId, isActive: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) {
      return { error: "This is the only active admin for this restaurant — promote someone else first." };
    }
  }

  await prisma.user.update({
    where: { id },
    data: { name, email: email || null, role, isActive },
  });
  await logActivity(
    admin,
    "UPDATE",
    "User",
    id,
    `Updated user @${target.username} (name: ${target.name} -> ${name}, role: ${target.role} -> ${role}, active: ${target.isActive} -> ${isActive})`,
  );

  revalidatePath("/users");
  return { success: "User updated." };
}

export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireRestaurantAdmin();

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const target = await prisma.user.findFirst({ where: { id, restaurantId: admin.restaurantId } });
  if (!target) return { error: "User not found." };

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  await logActivity(admin, "UPDATE", "User", id, `Reset password for @${target.username}`);

  revalidatePath("/users");
  return { success: `Password reset for ${target.username}.` };
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireRestaurantAdmin();
  const id = String(formData.get("id") ?? "");

  if (id === admin.id) {
    redirect("/users?error=" + encodeURIComponent("You cannot delete your own account."));
  }

  const target = await prisma.user.findFirst({ where: { id, restaurantId: admin.restaurantId } });
  if (!target) redirect("/users");

  if (target.role === "RESTAURANT_ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "RESTAURANT_ADMIN", restaurantId: admin.restaurantId, isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      redirect(
        "/users?error=" +
          encodeURIComponent("This is the only active admin for this restaurant — promote someone else first."),
      );
    }
  }

  await prisma.user.delete({ where: { id } });
  await logActivity(admin, "DELETE", "User", id, `Deleted user @${target.username} (${target.name})`);
  revalidatePath("/users");
  redirect("/users?deleted=" + encodeURIComponent(target.username));
}

// ---- Partywalas platform: create and manage restaurants ----

export async function createRestaurantAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const platformAdmin = await requireSuperAdmin();

  const restaurantName = String(formData.get("restaurantName") ?? "").trim();
  const address = (String(formData.get("address") ?? "").trim() || null);
  const phone = (String(formData.get("phone") ?? "").trim() || null);
  const gstin = (String(formData.get("gstin") ?? "").trim() || null);

  const username = normalizeUsername(formData.get("username"));
  const adminName = String(formData.get("adminName") ?? "").trim();
  const email = (String(formData.get("email") ?? "").trim() || null);
  const password = String(formData.get("password") ?? "");

  if (!restaurantName) return { error: "Restaurant name is required." };
  if (!USERNAME_RE.test(username)) {
    return { error: "Username must be 3–32 characters, using only letters, numbers, dot, underscore or hyphen." };
  }
  if (!adminName) return { error: "The restaurant admin's full name is required." };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) return { error: `Username "${username}" is already taken.` };

  const restaurant = await prisma.restaurant.create({
    data: { name: restaurantName, address, phone, gstin },
  });
  await prisma.user.create({
    data: {
      username,
      name: adminName,
      email,
      role: "RESTAURANT_ADMIN",
      restaurantId: restaurant.id,
      passwordHash: await hashPassword(password),
    },
  });
  await logActivity(platformAdmin, "CREATE", "Restaurant", restaurant.id, `Created restaurant "${restaurantName}" with admin @${username}`);

  revalidatePath("/platform");
  redirect(`/platform?created=${encodeURIComponent(restaurantName)}`);
}

export async function setRestaurantActiveAction(formData: FormData) {
  const platformAdmin = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("isActive") === "on";

  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) redirect("/platform");

  await prisma.restaurant.update({ where: { id }, data: { isActive } });
  await logActivity(
    platformAdmin,
    "UPDATE",
    "Restaurant",
    id,
    `${isActive ? "Reactivated" : "Deactivated"} restaurant "${restaurant.name}"`,
  );

  revalidatePath("/platform");
}

// ---- Self-service ----

export async function changeOwnPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record) return { error: "User not found." };

  if (!(await verifyPassword(current, record.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }
  if (next !== confirm) return { error: "The new passwords do not match." };

  const passwordError = validatePassword(next);
  if (passwordError) return { error: passwordError };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  return { success: "Your password has been changed." };
}

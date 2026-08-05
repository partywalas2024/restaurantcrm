"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  createSession,
  destroySession,
  hashPassword,
  requireAdmin,
  requireUser,
  validatePassword,
  verifyPassword,
} from "./auth";

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

// ---- Admin: user management ----

export async function createUserAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const username = normalizeUsername(formData.get("username"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";
  const password = String(formData.get("password") ?? "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
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

  await prisma.user.create({
    data: {
      username,
      name,
      email: email || null,
      role,
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath("/users");
  redirect("/users?created=" + encodeURIComponent(username));
}

export async function updateUserAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Full name is required." };

  // Guard rails against locking the whole business out of its own CRM.
  if (target.id === admin.id && (role !== "ADMIN" || !isActive)) {
    return { error: "You cannot remove your own admin access." };
  }
  if (target.role === "ADMIN" && (role !== "ADMIN" || !isActive)) {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) {
      return { error: "This is the only active admin — promote someone else first." };
    }
  }

  await prisma.user.update({
    where: { id },
    data: { name, email: email || null, role, isActive },
  });

  revalidatePath("/users");
  return { success: "User updated." };
}

export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found." };

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });

  revalidatePath("/users");
  return { success: `Password reset for ${target.username}.` };
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  if (id === admin.id) {
    redirect("/users?error=" + encodeURIComponent("You cannot delete your own account."));
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) redirect("/users");

  if (target.role === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      redirect(
        "/users?error=" +
          encodeURIComponent("This is the only active admin — promote someone else first."),
      );
    }
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
  redirect("/users?deleted=" + encodeURIComponent(target.username));
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

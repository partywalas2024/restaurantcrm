// Records who changed what, when.
//
// Deliberately fire-and-forget from the caller's perspective: a logging
// failure must never break the actual mutation it's describing, so every call
// site awaits this but this function itself swallows its own errors after
// reporting them. userName is captured at write time and never joined against
// User later, so the log stays readable after an account is deleted.

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";

export type ActivityAction = "CREATE" | "UPDATE" | "DELETE" | "IMPORT";

export async function logActivity(
  user: CurrentUser | null,
  action: ActivityAction,
  entity: string,
  entityId: string | null,
  summary: string,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        restaurantId: user?.restaurantId ?? null,
        userId: user?.id ?? null,
        userName: user?.name ?? "System",
        action,
        entity,
        entityId,
        summary,
      },
    });
  } catch (err) {
    // Never let audit logging take down the mutation it's describing.
    console.error("Failed to write activity log:", err);
  }
}

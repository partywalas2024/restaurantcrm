// The restaurant profile — the single row that supplies the name, address and
// GSTIN shown in the sidebar and printed on every report, ledger and receipt.
//
// Stored as a singleton row rather than hardcoded so the app can be handed to
// another restaurant without a code change.

import { prisma } from "@/lib/prisma";

const DEFAULT_NAME = "Junction 14";

/** Always returns a profile — creates the default row on first call. */
export async function getRestaurantProfile() {
  const existing = await prisma.restaurantProfile.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  try {
    return await prisma.restaurantProfile.create({ data: { id: "default", name: DEFAULT_NAME } });
  } catch {
    // Next.js can call this concurrently (e.g. generateMetadata + the page body) on the very
    // first-ever request — the loser of that race just reads what the winner created.
    return prisma.restaurantProfile.findUniqueOrThrow({ where: { id: "default" } });
  }
}

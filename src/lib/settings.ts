// Restaurant profile lookups — the name, address and GSTIN shown in the
// sidebar and printed on every report, ledger and receipt for one specific
// restaurant. Every restaurant on the platform has its own row; there is no
// longer a single "the" profile.

import { prisma } from "@/lib/prisma";

export async function getRestaurant(restaurantId: string) {
  return prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
}

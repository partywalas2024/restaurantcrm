import { prisma } from "@/lib/prisma";

export type RfmSegment = "Champion" | "Loyal" | "Big Spender" | "New" | "At Risk" | "Lost" | "Regular";

export const SEGMENT_TONE: Record<RfmSegment, "ok" | "info" | "warn" | "crit" | "neutral"> = {
  Champion: "ok",
  Loyal: "ok",
  "Big Spender": "info",
  New: "info",
  "At Risk": "warn",
  Lost: "crit",
  Regular: "neutral",
};

export const SEGMENT_DESCRIPTION: Record<RfmSegment, string> = {
  Champion: "Recent, frequent, and high-spend — your best guests.",
  Loyal: "Visits often and spends well, even if not the most recent.",
  "Big Spender": "High spend on few visits — worth a personal touch to bring back.",
  New: "One recent visit — the window to turn them into a regular.",
  "At Risk": "Used to visit more — drifting, worth a win-back nudge.",
  Lost: "Low recency, frequency and spend — hasn't been back in a while.",
  Regular: "Steady, unremarkable pattern — no signal to act on yet.",
};

type GuestMetrics = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  whatsappOptIn: boolean;
  birthday: Date | null;
  anniversary: Date | null;
  createdAt: Date;
  visitCount: number;
  totalSpend: number;
  lastVisit: Date | null;
  avgSpend: number | null;
};

type GuestWithRfm = GuestMetrics & { rScore: number; fScore: number; mScore: number; segment: RfmSegment };

// Every RFM/segmentation number here is computed relative to this restaurant's
// own guest base (quantile rank, 1-5), not against fixed universal
// thresholds — meaningful at any guest-list size, including a handful of
// guests early on, since it's a ranking, not an absolute scale.
async function getAllGuestMetrics(restaurantId: string): Promise<GuestMetrics[]> {
  const customers = await prisma.customer.findMany({
    where: { restaurantId },
    include: { visits: { select: { amount: true, date: true } } },
    orderBy: { createdAt: "desc" },
  });

  return customers.map((c) => {
    const visitCount = c.visits.length;
    const totalSpend = c.visits.reduce((s, v) => s + v.amount, 0);
    const lastVisit = c.visits.reduce<Date | null>((latest, v) => (!latest || v.date > latest ? v.date : latest), null);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      whatsappOptIn: c.whatsappOptIn,
      birthday: c.birthday,
      anniversary: c.anniversary,
      createdAt: c.createdAt,
      visitCount,
      totalSpend,
      lastVisit,
      avgSpend: visitCount > 0 ? totalSpend / visitCount : null,
    };
  });
}

/** Ranks `values` (higher "goodness" = better) into a 1-5 quantile score, stable for ties. */
function quantileScore(goodness: number[]): number[] {
  const n = goodness.length;
  if (n === 0) return [];
  const order = goodness.map((_, i) => i).sort((a, b) => goodness[a] - goodness[b]);
  const scores = new Array<number>(n);
  order.forEach((originalIndex, rank) => {
    scores[originalIndex] = Math.min(5, 1 + Math.floor((rank / n) * 5));
  });
  return scores;
}

function classifySegment(rScore: number, fScore: number, mScore: number, visitCount: number): RfmSegment {
  if (rScore >= 4 && fScore >= 4 && mScore >= 4) return "Champion";
  if (fScore >= 4 && mScore >= 3) return "Loyal";
  if (visitCount === 1 && rScore >= 4) return "New";
  if (mScore >= 4 && fScore <= 2) return "Big Spender";
  if (rScore <= 2 && fScore <= 2 && mScore <= 2 && visitCount > 0) return "Lost";
  if (rScore <= 2 && (fScore >= 3 || mScore >= 3)) return "At Risk";
  return "Regular";
}

function withRfm(guests: GuestMetrics[]): GuestWithRfm[] {
  const now = Date.now();
  const recencyGoodness = guests.map((g) => (g.lastVisit ? -(now - g.lastVisit.getTime()) : -Infinity));
  const frequencyGoodness = guests.map((g) => g.visitCount);
  const monetaryGoodness = guests.map((g) => g.totalSpend);

  const rScores = quantileScore(recencyGoodness);
  const fScores = quantileScore(frequencyGoodness);
  const mScores = quantileScore(monetaryGoodness);

  return guests.map((g, i) => {
    // No visits at all yet — scoring is meaningless, not just low.
    if (g.visitCount === 0) {
      return { ...g, rScore: 0, fScore: 0, mScore: 0, segment: "Regular" as RfmSegment };
    }
    const rScore = rScores[i];
    const fScore = fScores[i];
    const mScore = mScores[i];
    return { ...g, rScore, fScore, mScore, segment: classifySegment(rScore, fScore, mScore, g.visitCount) };
  });
}

export async function getCustomers(restaurantId: string, search?: string) {
  const all = withRfm(await getAllGuestMetrics(restaurantId));
  if (!search) return all;
  const q = search.toLowerCase();
  return all.filter((g) => g.name.toLowerCase().includes(q) || g.phone.includes(search));
}

export async function getCustomerById(restaurantId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, restaurantId },
    include: { visits: { orderBy: { date: "desc" } } },
  });
  if (!customer) return null;

  const all = withRfm(await getAllGuestMetrics(restaurantId));
  const rfm = all.find((g) => g.id === id);

  const visitCount = customer.visits.length;
  const totalSpend = customer.visits.reduce((s, v) => s + v.amount, 0);
  const lastVisit = customer.visits[0]?.date ?? null;

  return {
    ...customer,
    visitCount,
    totalSpend,
    lastVisit,
    avgSpend: visitCount > 0 ? totalSpend / visitCount : null,
    rScore: rfm?.rScore ?? 0,
    fScore: rfm?.fScore ?? 0,
    mScore: rfm?.mScore ?? 0,
    segment: rfm?.segment ?? "Regular",
  };
}

export async function getGuestStats(restaurantId: string) {
  const [totalGuests, visitsThisMonth] = await Promise.all([
    prisma.customer.count({ where: { restaurantId } }),
    prisma.customerVisit.count({
      where: {
        restaurantId,
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);
  return { totalGuests, visitsThisMonth };
}

export async function getGuestInsights(restaurantId: string) {
  const guests = withRfm(await getAllGuestMetrics(restaurantId));
  const withVisits = guests.filter((g) => g.visitCount > 0);

  const newGuests = withVisits.filter((g) => g.visitCount === 1);
  const returningGuests = withVisits.filter((g) => g.visitCount > 1);
  const newRevenue = newGuests.reduce((s, g) => s + g.totalSpend, 0);
  const returningRevenue = returningGuests.reduce((s, g) => s + g.totalSpend, 0);
  const totalRevenue = newRevenue + returningRevenue;

  const segmentCounts = new Map<RfmSegment, number>();
  for (const g of withVisits) {
    segmentCounts.set(g.segment, (segmentCounts.get(g.segment) ?? 0) + 1);
  }

  const topGuests = [...withVisits].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

  return {
    guestsWithVisits: withVisits.length,
    newVsReturning: {
      newCount: newGuests.length,
      returningCount: returningGuests.length,
      newRevenue,
      returningRevenue,
      returningRevenuePct: totalRevenue > 0 ? (returningRevenue / totalRevenue) * 100 : null,
    },
    segments: (["Champion", "Loyal", "Big Spender", "New", "At Risk", "Lost", "Regular"] as RfmSegment[]).map((segment) => ({
      segment,
      count: segmentCounts.get(segment) ?? 0,
    })),
    topGuests,
  };
}

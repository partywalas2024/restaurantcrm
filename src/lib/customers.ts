import { prisma } from "@/lib/prisma";

export async function getCustomers(restaurantId: string, search?: string) {
  const customers = await prisma.customer.findMany({
    where: {
      restaurantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      visits: { select: { amount: true, date: true } },
    },
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

export async function getCustomerById(restaurantId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, restaurantId },
    include: {
      visits: { orderBy: { date: "desc" } },
    },
  });
  if (!customer) return null;

  const visitCount = customer.visits.length;
  const totalSpend = customer.visits.reduce((s, v) => s + v.amount, 0);
  const lastVisit = customer.visits[0]?.date ?? null;

  return {
    ...customer,
    visitCount,
    totalSpend,
    lastVisit,
    avgSpend: visitCount > 0 ? totalSpend / visitCount : null,
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

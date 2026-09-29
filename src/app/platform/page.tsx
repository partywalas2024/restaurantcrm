import { CheckCircle2, Building2, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { CreateRestaurantForm, ToggleRestaurantActiveButton, ResetRestaurantAdminPasswordButton, EditRestaurantForm } from "@/components/PlatformForms";

export const dynamic = "force-dynamic";

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: { where: { role: "RESTAURANT_ADMIN" }, orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { users: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Partywalas Platform"
        description="Restaurants with CRM access — each runs its own isolated team and data"
      />

      {params.created && (
        <p className="mb-6 flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 size={16} /> Restaurant &ldquo;{params.created}&rdquo; created.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Restaurants" className="lg:col-span-2">
          {restaurants.length === 0 ? (
            <EmptyState title="No restaurants yet" description="Create the first one to give it CRM access." />
          ) : (
            <div className="divide-y divide-border">
              {restaurants.map((r) => (
                <div key={r.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="shrink-0 text-muted" />
                        <p className="truncate font-medium">{r.name}</p>
                        <Badge tone={r.isActive ? "ok" : "neutral"}>{r.isActive ? "Active" : "Deactivated"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {r.users[0] ? `Admin: @${r.users[0].username}` : "No admin"} · <Users size={11} className="inline -mt-0.5" /> {r._count.users} user(s) · created {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <EditRestaurantForm restaurant={{ id: r.id, name: r.name, address: r.address, phone: r.phone, gstin: r.gstin }} />
                      {r.users[0] && <ResetRestaurantAdminPasswordButton userId={r.users[0].id} username={r.users[0].username} />}
                      <ToggleRestaurantActiveButton id={r.id} isActive={r.isActive} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Add Restaurant">
          <CreateRestaurantForm />
        </Card>
      </div>
    </div>
  );
}

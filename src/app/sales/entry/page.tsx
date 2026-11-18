import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";
import { saveDailySales } from "@/lib/sales-actions";

export const dynamic = "force-dynamic";

export default async function SalesEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRestaurantUser();
  const dateStr = params.date ?? new Date().toISOString().slice(0, 10);

  const [existing, menuItems] = await Promise.all([
    prisma.dailySales.findFirst({ where: { restaurantId: user.restaurantId, date: new Date(dateStr) }, include: { items: true } }),
    prisma.menuItem.findMany({ where: { restaurantId: user.restaurantId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const qtyByItem = new Map((existing?.items ?? []).map((i) => [i.menuItemId, i.quantity]));

  return (
    <div>
      <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to sales
      </Link>
      <PageHeader
        title={existing ? `Edit Sales — ${dateStr}` : "Add Sales Entry"}
        description="Revenue, payment mix, and item-wise quantities. Item quantities with recipes auto-deduct stock (hybrid consumption)."
      />

      <form action={saveDailySales} className="space-y-5">
        <Card title="Day & Revenue">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date *</label>
              <input type="date" name="date" required defaultValue={dateStr} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Covers</label>
              <input type="number" name="covers" min="0" defaultValue={existing?.covers ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
          </div>

          <h3 className="mt-4 mb-2 text-xs font-semibold text-muted">Revenue by Channel (₹)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted">Dine-in</label>
              <input type="number" name="dineInRevenue" step="any" min="0" defaultValue={existing?.dineInRevenue ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Delivery</label>
              <input type="number" name="deliveryRevenue" step="any" min="0" defaultValue={existing?.deliveryRevenue ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Takeaway</label>
              <input type="number" name="takeawayRevenue" step="any" min="0" defaultValue={existing?.takeawayRevenue ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Other</label>
              <input type="number" name="otherRevenue" step="any" min="0" defaultValue={existing?.otherRevenue ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
          </div>

          <h3 className="mt-4 mb-2 text-xs font-semibold text-muted">Payment Mode (₹)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted">Cash</label>
              <input type="number" name="cashAmount" step="any" min="0" defaultValue={existing?.cashAmount ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">UPI</label>
              <input type="number" name="upiAmount" step="any" min="0" defaultValue={existing?.upiAmount ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Card</label>
              <input type="number" name="cardAmount" step="any" min="0" defaultValue={existing?.cardAmount ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Other</label>
              <input type="number" name="otherPaymentAmount" step="any" min="0" defaultValue={existing?.otherPaymentAmount ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
            <textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
        </Card>

        {menuItems.length > 0 && (
          <Card title="Item-wise Quantities Sold (optional)">
            <p className="mb-3 text-xs text-muted">
              Only active menu items are listed. Quantities for dishes with recipes auto-deduct ingredient stock when you save.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {menuItems.map((mi) => (
                <div key={mi.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="text-sm">{mi.name}</span>
                  <input
                    type="number"
                    name={`qty_${mi.id}`}
                    step="any"
                    min="0"
                    defaultValue={qtyByItem.get(mi.id) ?? ""}
                    className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">
          Save Sales Entry
        </button>
      </form>
    </div>
  );
}

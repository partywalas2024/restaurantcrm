import Link from "next/link";
import { Plus, UploadCloud, TrendingUp, Users, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getAvailableSalesMonths, getSalesForMonth } from "@/lib/sales";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR, formatNumber, pctChange } from "@/lib/format";
import { deleteDailySales } from "@/lib/sales-actions";

export const dynamic = "force-dynamic";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRestaurantUser();
  const months = await getAvailableSalesMonths(user.restaurantId);

  const actions = (
    <>
      <Link href="/sales/import-reports" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
        <UploadCloud size={14} /> Sync PetPooja Reports
      </Link>
      <Link href="/sales/import" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
        <UploadCloud size={14} /> Import Item-wise CSV
      </Link>
      <Link href="/sales/entry" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
        <Plus size={14} /> Add Entry
      </Link>
    </>
  );

  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Sales" description="Daily revenue, covers, and channel/payment mix" actions={actions} />
        <EmptyState title="No sales recorded yet" description="Import a PetPooja export or add today's sales manually to get started." />
      </div>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const sales = await getSalesForMonth(user.restaurantId, month);
  const change = pctChange(sales.totalRevenue, sales.prevRevenue);

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Daily revenue, covers, and channel/payment mix"
        actions={
          <>
            <MonthSelect months={months} value={month} />
            {actions}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={formatINR(sales.totalRevenue)} icon={TrendingUp} change={change ?? undefined} sublabel="vs last month" />
        <StatCard label="Covers" value={formatNumber(sales.totalCovers)} icon={Users} />
        <StatCard label="Avg Ticket Size" value={sales.avgTicket !== null ? formatINR(sales.avgTicket, { decimals: true }) : "—"} icon={Receipt} tone="info" />
        <StatCard label="Days Recorded" value={sales.daysRecorded} icon={Wallet} tone="info" />
      </div>

      <Card className="mt-6">
        {sales.rows.length === 0 ? (
          <EmptyState title="No sales this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3 text-right">Revenue</th>
                  <th className="pb-2 pr-3 text-right">Dine-in</th>
                  <th className="pb-2 pr-3 text-right">Delivery</th>
                  <th className="pb-2 pr-3 text-right">Takeaway</th>
                  <th className="pb-2 pr-3 text-right">Covers</th>
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {[...sales.rows].reverse().map((r) => {
                  const total = r.dineInRevenue + r.deliveryRevenue + r.takeawayRevenue + r.otherRevenue;
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <Link href={`/sales/entry?date=${r.date.toISOString().slice(0, 10)}`} className="font-medium hover:text-brand hover:underline">
                          {formatDate(r.date)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium">{formatINR(total)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{formatINR(r.dineInRevenue)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{formatINR(r.deliveryRevenue)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{formatINR(r.takeawayRevenue)}</td>
                      <td className="py-2.5 pr-3 text-right">{r.covers || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={r.source === "PETPOOJA_IMPORT" ? "info" : "neutral"}>{r.source === "PETPOOJA_IMPORT" ? "POS Import" : "Manual"}</Badge>
                      </td>
                      <td className="py-2.5">
                        <form action={deleteDailySales}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs text-crit hover:underline">Delete</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

import { Trash2, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { getAvailableBusinessMonths, getWasteForMonth } from "@/lib/sales";
import { prisma } from "@/lib/prisma";
import { formatDate, formatINR } from "@/lib/format";
import { recordWaste, deleteWaste } from "@/lib/sales-actions";

export const dynamic = "force-dynamic";

export default async function WastePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const months = await getAvailableBusinessMonths();
  const month = params.month && months.includes(params.month) ? params.month : months[0] ?? new Date().toISOString().slice(0, 7);
  const [waste, products] = await Promise.all([getWasteForMonth(month), prisma.product.findMany({ orderBy: { name: "asc" } })]);

  return (
    <div>
      <PageHeader
        title="Waste & Spoilage"
        description="Track ingredient waste to see where money leaks before it hits the P&L"
        actions={months.length > 0 ? <MonthSelect months={months} value={month} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total Waste Cost" value={formatINR(waste.total)} icon={TrendingDown} tone={waste.total > 0 ? "warn" : "ok"} />
        <StatCard label="Entries This Month" value={waste.rows.length} icon={Trash2} tone="info" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Entries" className="lg:col-span-2">
          {waste.rows.length === 0 ? (
            <EmptyState title="No waste recorded this month" description="Good sign — or nobody's logging it yet." />
          ) : (
            <div className="divide-y divide-border">
              {waste.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{r.product.name} · {r.quantity} {r.product.unit}</p>
                    <p className="text-xs text-muted">{formatDate(r.date)}{r.reason ? ` · ${r.reason}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatINR(r.estimatedCost, { decimals: true })}</span>
                    <form action={deleteWaste}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs text-crit hover:underline">Delete</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Log Waste">
          <form action={recordWaste} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date</label>
              <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Product</label>
              <select name="productId" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Quantity</label>
              <input type="number" name="quantity" step="any" min="0.01" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Estimated Cost (₹, optional)</label>
              <input type="number" name="estimatedCost" step="any" min="0" placeholder="auto from last purchase cost" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Reason</label>
              <input name="reason" placeholder="Spoilage, over-prep, dropped..." className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Log Waste
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

import { Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { getAvailableBusinessMonths, getLaborCostForMonth } from "@/lib/sales";
import { formatDate, formatINR } from "@/lib/format";
import { recordLaborCost, deleteLaborCost } from "@/lib/sales-actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  WAGES: "Wages",
  SALARIES: "Salaries",
  TIPS_PAYOUT: "Tips Payout",
  OTHER: "Other",
};

export default async function LaborPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const months = await getAvailableBusinessMonths();
  const month = params.month && months.includes(params.month) ? params.month : months[0] ?? new Date().toISOString().slice(0, 7);
  const labor = await getLaborCostForMonth(month);

  return (
    <div>
      <PageHeader
        title="Labor Cost"
        description="Wages, salaries, and tip payouts — the other big cost line in your P&L"
        actions={months.length > 0 ? <MonthSelect months={months} value={month} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total Labor Cost" value={formatINR(labor.total)} icon={Wallet} />
        <StatCard label="Entries This Month" value={labor.rows.length} icon={Users} tone="info" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Entries" className="lg:col-span-2">
          {labor.rows.length === 0 ? (
            <EmptyState title="No labor costs recorded this month" />
          ) : (
            <div className="divide-y divide-border">
              {labor.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{CATEGORY_LABELS[r.category] ?? r.category}</p>
                    <p className="text-xs text-muted">{formatDate(r.date)}{r.notes ? ` · ${r.notes}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatINR(r.amount, { decimals: true })}</span>
                    <form action={deleteLaborCost}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs text-crit hover:underline">Delete</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Add Entry">
          <form action={recordLaborCost} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date</label>
              <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Category</label>
              <select name="category" defaultValue="WAGES" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Amount (₹)</label>
              <input type="number" name="amount" step="any" min="0.01" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
              <textarea name="notes" rows={2} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Add Entry
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

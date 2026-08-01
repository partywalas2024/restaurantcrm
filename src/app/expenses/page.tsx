import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { BarList } from "@/components/charts/BarList";
import { ExportButton } from "@/components/ExportButton";
import { getAvailableMonths, getOverview } from "@/lib/data";
import { formatINR, formatMonth, pctChange } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { Wallet, TrendingDown, TrendingUp, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const months = await getAvailableMonths();
  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Expense Analysis" />
        <EmptyState title="No expense data yet" />
      </div>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const overview = await getOverview(month);
  const change = pctChange(overview.totalSpend, overview.prevSpend);

  const sortedCategories = [...overview.categorySpend].sort((a, b) => b.amount - a.amount);
  const total = sortedCategories.reduce((s, c) => s + c.amount, 0);

  const barData = sortedCategories.map((c) => ({ label: CATEGORY_LABELS[c.category], amount: c.amount }));

  return (
    <div>
      <PageHeader
        title="Expense Analysis"
        description="Where the month's money went, broken down by category"
        actions={
          <>
            <MonthSelect months={months} value={month} />
            <ExportButton kind="expenses" searchParams={{ month }} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Monthly Expense" value={formatINR(overview.totalSpend)} icon={Wallet} change={change ?? undefined} sublabel="vs last month" />
        <StatCard
          label="Previous Month"
          value={formatINR(overview.prevSpend)}
          icon={change !== null && change < 0 ? TrendingDown : TrendingUp}
          tone={change !== null && change < 0 ? "ok" : "warn"}
        />
        <StatCard label="Categories Active" value={sortedCategories.length} icon={Layers} tone="info" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Category Split">
          <CategoryDonut data={overview.categorySpend} />
        </Card>
        <Card title="Category Spend Ranked">
          <BarList data={barData} />
        </Card>
      </div>

      <Card title={`Category Breakdown — ${formatMonth(`${month}-01`)}`} className="mt-6">
        {sortedCategories.length === 0 ? (
          <EmptyState title="No expenses recorded this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map((c) => (
                  <tr key={c.category} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3">{CATEGORY_LABELS[c.category]}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatINR(c.amount)}</td>
                    <td className="py-2.5 text-right text-muted">{total > 0 ? ((c.amount / total) * 100).toFixed(1) : "0.0"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

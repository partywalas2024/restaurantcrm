import Link from "next/link";
import { TrendingUp, TrendingDown, Percent, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getAvailableBusinessMonths, getProfitAndLoss, getMenuItemPerformance } from "@/lib/sales";
import { formatINR, formatMonth, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const months = await getAvailableBusinessMonths();

  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Profitability (P&L)" />
        <EmptyState title="No data yet" description="Record some sales and purchases to see your P&L." />
      </div>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const [pl, menuPerf] = await Promise.all([getProfitAndLoss(month), getMenuItemPerformance(month)]);

  const topSellers = [...menuPerf].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const worstMargin = [...menuPerf].filter((m) => m.hasRecipe).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Profitability (P&L)"
        description={`${formatMonth(`${month}-01`)} — revenue against theoretical food cost, labor, and overheads`}
        actions={<MonthSelect months={months} value={month} />}
      />

      {pl.revenue === 0 && (
        <p className="mb-6 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-xs text-warn">
          No sales recorded for {formatMonth(`${month}-01`)} yet — import a POS export or add entries on the{" "}
          <Link href="/sales" className="underline">Sales</Link> page to see a real P&L.
        </p>
      )}
      {pl.totalMenuItemsSold > 0 && pl.itemsWithRecipe < pl.totalMenuItemsSold && (
        <p className="mb-6 rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
          Food cost is theoretical — computed only from menu items that have a recipe defined ({pl.itemsWithRecipe} of {pl.totalMenuItemsSold} sold this
          month). Add recipes on the <Link href="/menu" className="underline">Menu</Link> page for a more complete number.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatINR(pl.revenue)} icon={TrendingUp} />
        <StatCard label="Food Cost %" value={pl.foodCostPct !== null ? `${pl.foodCostPct.toFixed(1)}%` : "—"} icon={Percent} tone={pl.foodCostPct !== null && pl.foodCostPct > 35 ? "warn" : "ok"} />
        <StatCard label="Labor Cost %" value={pl.laborCostPct !== null ? `${pl.laborCostPct.toFixed(1)}%` : "—"} icon={Percent} tone="info" />
        <StatCard
          label="Operating Profit"
          value={formatINR(pl.operatingProfit)}
          icon={pl.operatingProfit >= 0 ? TrendingUp : TrendingDown}
          tone={pl.operatingProfit >= 0 ? "ok" : "crit"}
        />
      </div>

      <Card title="P&L Statement" className="mt-6 max-w-xl">
        <div className="space-y-1.5 text-sm">
          <Row label="Revenue" value={pl.revenue} bold />
          <Row label="− Food Cost (COGS)" value={-pl.cogs} muted />
          <Row label="= Gross Profit" value={pl.grossProfit} bold border />
          <Row label="− Labor Cost" value={-pl.laborCost} muted />
          <Row label="− Other Operating Expenses" value={-pl.otherOpex} muted />
          <Row label="= Operating Profit" value={pl.operatingProfit} bold border large />
          {pl.wasteCost > 0 && (
            <p className="pt-2 text-xs text-muted">Memo: {formatINR(pl.wasteCost)} in logged waste this month (already excluded above, shown for reference).</p>
          )}
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Top Sellers by Revenue">
          {topSellers.length === 0 ? (
            <EmptyState title="No item-wise sales this month" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Item</th>
                    <th className="pb-2 pr-3 text-right">Qty</th>
                    <th className="pb-2 pr-3 text-right">Revenue</th>
                    <th className="pb-2 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {topSellers.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/menu/${m.id}`} className="hover:text-brand hover:underline">{m.name}</Link>
                      </td>
                      <td className="py-2 pr-3 text-right">{formatNumber(m.qty, 1)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatINR(m.revenue)}</td>
                      <td className="py-2 text-right">
                        {m.marginPct !== null ? (
                          <Badge tone={m.marginPct >= 50 ? "ok" : m.marginPct >= 20 ? "warn" : "crit"}>{m.marginPct.toFixed(0)}%</Badge>
                        ) : (
                          <span className="text-muted">no recipe</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Lowest Margin Items" actions={<Scale size={14} className="text-muted" />}>
          {worstMargin.length === 0 ? (
            <EmptyState title="No items with a recipe sold this month" />
          ) : (
            <div className="divide-y divide-border">
              {worstMargin.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/menu/${m.id}`} className="hover:text-brand hover:underline">{m.name}</Link>
                  <Badge tone={m.marginPct !== null && m.marginPct < 20 ? "crit" : "warn"}>{m.marginPct?.toFixed(0)}%</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted, border, large }: { label: string; value: number; bold?: boolean; muted?: boolean; border?: boolean; large?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${border ? "border-t border-border pt-2" : ""} ${bold ? "font-semibold" : ""} ${large ? "text-base" : ""} ${muted ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span>{value < 0 ? "−" : ""}{formatINR(Math.abs(value), { decimals: true })}</span>
    </div>
  );
}

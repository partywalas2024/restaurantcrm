import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { TrendLine } from "@/components/charts/TrendLine";
import { BarList } from "@/components/charts/BarList";
import { ExportButton } from "@/components/ExportButton";
import { getAvailableMonths, getOverview, getDailyTrend, getVendors, getProducts, getMonthlyTrend } from "@/lib/data";
import { getRevenueTrend, getMenuItemPerformance, getSalesForMonth, getDayOfWeekPattern, projectNextValue } from "@/lib/sales";
import { requireRestaurantAdmin } from "@/lib/auth";
import { formatDate, formatINR, formatMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRestaurantAdmin();
  const months = await getAvailableMonths(user.restaurantId);
  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Analytics & Reports" />
        <EmptyState title="No data yet" />
      </div>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const [overview, daily, vendors, products] = await Promise.all([
    getOverview(user.restaurantId, month),
    getDailyTrend(user.restaurantId, month),
    getVendors(user.restaurantId),
    getProducts(user.restaurantId),
  ]);

  const dailyData = daily.map((d) => ({ label: formatDate(d.date), amount: d.amount }));
  const vendorBarData = vendors.map((v) => ({ label: v.name, amount: v.totalAmount })).slice(0, 10);

  const paymentBreakdown = [
    { status: "Paid", amount: overview.bills.filter((b) => b.type === "INVOICE" && (b.paymentStatus === "PAID" || b.paymentStatus === "UNKNOWN")).reduce((s, b) => s + b.grandTotal, 0) },
    { status: "Unpaid", amount: overview.bills.filter((b) => b.paymentStatus === "UNPAID").reduce((s, b) => s + b.grandTotal, 0) },
    { status: "Partial", amount: overview.bills.filter((b) => b.paymentStatus === "PARTIAL").reduce((s, b) => s + b.grandTotal, 0) },
  ].filter((p) => p.amount > 0);

  const topBills = [...overview.bills]
    .filter((b) => b.type === "INVOICE")
    .sort((a, b) => b.grandTotal - a.grandTotal)
    .slice(0, 10);

  const topProductsUsage = products
    .filter((p) => p.timesPurchased > 0)
    .sort((a, b) => b.timesPurchased - a.timesPurchased)
    .slice(0, 10)
    .map((p) => ({ label: p.name, amount: p.timesPurchased }));

  const lowStockData = overview.lowStockItems
    .map((p) => ({ label: p.name, amount: p.currentStock }))
    .slice(0, 10);

  const trendMonths = await getMonthlyTrend(user.restaurantId);
  const idx = trendMonths.findIndex((t) => t.month === month);
  const monthComparison = idx >= 0 ? trendMonths.slice(Math.max(0, idx - 5), idx + 1) : trendMonths.slice(-6);
  const monthComparisonData = monthComparison.map((t) => ({ label: formatMonth(`${t.month}-01`), amount: t.amount }));

  // ---- Sales & menu side, so this page is a whole-business analysis view rather than purchases only ----
  const [revenueTrendAll, menuPerf, salesMonth] = await Promise.all([
    getRevenueTrend(user.restaurantId),
    getMenuItemPerformance(user.restaurantId, month),
    getSalesForMonth(user.restaurantId, month),
  ]);
  const revIdx = revenueTrendAll.findIndex((t) => t.month === month);
  const revenueComparison = revIdx >= 0 ? revenueTrendAll.slice(Math.max(0, revIdx - 5), revIdx + 1) : revenueTrendAll.slice(-6);
  const revenueComparisonData = revenueComparison.map((t) => ({ label: formatMonth(`${t.month}-01`), amount: t.amount }));

  const topSellers = menuPerf.slice(0, 10).map((m) => ({ label: m.name, amount: m.revenue }));
  const lowestMarginItems = [...menuPerf].filter((m) => m.hasRecipe).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).slice(0, 8);

  const channelData = [
    { label: "Dine-in", amount: salesMonth.channelSplit.dineIn },
    { label: "Delivery", amount: salesMonth.channelSplit.delivery },
    { label: "Takeaway", amount: salesMonth.channelSplit.takeaway },
    { label: "Other", amount: salesMonth.channelSplit.other },
  ].filter((c) => c.amount > 0);

  // ---- Patterns & projection ----
  const dayPattern = await getDayOfWeekPattern(user.restaurantId);
  const dayPatternData = dayPattern.map((d) => ({ label: d.label.slice(0, 3), amount: Math.round(d.avgRevenue) }));
  const bestDay = [...dayPattern].filter((d) => d.days > 0).sort((a, b) => b.avgRevenue - a.avgRevenue)[0];

  const revenueProjection = projectNextValue(revenueTrendAll);
  const spendProjection = projectNextValue(trendMonths);

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        description="Trends, rankings, and the numbers behind the month"
        actions={
          <>
            <MonthSelect months={months} value={month} />
            <ExportButton kind="analytics" searchParams={{ month }} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Daily Spending — ${formatMonth(`${month}-01`)}`}>
          <TrendLine data={dailyData} />
        </Card>
        <Card title="Month vs Month Comparison (last 6 months)">
          <BarList data={monthComparisonData} horizontal={false} />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Purchases by Vendor">
          <BarList data={vendorBarData} color="var(--info)" />
        </Card>
        <Card title="Payment Status Split">
          {paymentBreakdown.length === 0 ? (
            <EmptyState title="No payment data" />
          ) : (
            <div className="flex flex-col items-center">
              <svg width="0" height="0" />
              <PaymentDonutFallback data={paymentBreakdown} />
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Most Frequently Purchased Products">
          <BarList data={topProductsUsage} color="var(--ok)" />
        </Card>
        <Card title="Low Stock Products">
          {lowStockData.length === 0 ? (
            <EmptyState title="Nothing is low on stock" description="All tracked products are above their reorder level." />
          ) : (
            <BarList data={lowStockData} color="var(--warn)" />
          )}
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">Sales &amp; Menu</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Revenue Trend (last 6 months)">
          {revenueComparisonData.length === 0 ? (
            <EmptyState title="No sales recorded yet" description="Import a POS export or add daily sales entries." />
          ) : (
            <BarList data={revenueComparisonData} color="var(--ok)" />
          )}
        </Card>
        <Card title={`Revenue by Channel — ${formatMonth(`${month}-01`)}`}>
          {channelData.length === 0 ? (
            <EmptyState title="No sales this month" />
          ) : (
            <BarList data={channelData} color="var(--info)" />
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Top Sellers by Revenue — ${formatMonth(`${month}-01`)}`}>
          {topSellers.length === 0 ? (
            <EmptyState title="No item-wise sales this month" />
          ) : (
            <BarList data={topSellers} color="var(--brand)" />
          )}
        </Card>
        <Card title="Lowest Margin Items (with a recipe)">
          {lowestMarginItems.length === 0 ? (
            <EmptyState title="No recipe-costed items sold this month" description="Add recipes on the Menu & Recipes page to see margin here." />
          ) : (
            <div className="divide-y divide-border">
              {lowestMarginItems.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{m.name}</span>
                  <Badge tone={(m.marginPct ?? 0) < 0 ? "crit" : (m.marginPct ?? 0) < 20 ? "warn" : "ok"}>
                    {m.marginPct !== null ? `${m.marginPct.toFixed(0)}%` : "—"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Revenue by Day of Week (all-time average)">
          {dayPatternData.every((d) => d.amount === 0) ? (
            <EmptyState title="Not enough sales history yet" />
          ) : (
            <>
              <BarList data={dayPatternData} color="var(--brand)" />
              {bestDay && bestDay.avgRevenue > 0 && (
                <p className="mt-3 text-xs text-muted">
                  <span className="font-medium text-foreground">{bestDay.label}</span> does best on average — {formatINR(bestDay.avgRevenue, { decimals: true })}/day across {bestDay.days} recorded day(s).
                </p>
              )}
            </>
          )}
        </Card>
        <Card title="Next Month — Trend Projection">
          {!revenueProjection && !spendProjection ? (
            <EmptyState title="Not enough months of history" description="Needs at least 2 months of sales or purchase data to project a trend." />
          ) : (
            <div className="space-y-4">
              {revenueProjection && (
                <div>
                  <p className="text-xs text-muted">Projected revenue — {formatMonth(`${revenueProjection.nextMonth}-01`)}</p>
                  <p className="text-lg font-semibold">{formatINR(revenueProjection.projected)}</p>
                </div>
              )}
              {spendProjection && (
                <div>
                  <p className="text-xs text-muted">Projected purchase spend — {formatMonth(`${spendProjection.nextMonth}-01`)}</p>
                  <p className="text-lg font-semibold">{formatINR(spendProjection.projected)}</p>
                </div>
              )}
              <p className="text-xs text-muted">
                Straight-line trend from the last {Math.max(revenueProjection?.basedOnMonths ?? 0, spendProjection?.basedOnMonths ?? 0)} month(s) — a rough indicator, not a forecasting model. Treat as directional only.
              </p>
            </div>
          )}
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">Purchases &amp; Supply</h2>
      <Card title="Top 10 Most Expensive Purchases">
        {topBills.length === 0 ? (
          <EmptyState title="No purchases this month" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Bill</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {topBills.map((b, i) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 text-muted">{i + 1}</td>
                    <td className="py-2 pr-3 font-medium">{b.billNumber}</td>
                    <td className="py-2 pr-3 text-muted">{formatDate(b.date)}</td>
                    <td className="py-2 pr-3">{b.vendor.name}</td>
                    <td className="py-2 text-right font-medium">{formatINR(b.grandTotal)}</td>
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

function PaymentDonutFallback({ data }: { data: { status: string; amount: number }[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const tones: Record<string, "ok" | "crit" | "warn"> = { Paid: "ok", Unpaid: "crit", Partial: "warn" };
  return (
    <div className="w-full space-y-3 py-2">
      {data.map((d) => (
        <div key={d.status}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <Badge tone={tones[d.status]}>{d.status}</Badge>
            <span className="font-medium">{formatINR(d.amount)} ({total > 0 ? ((d.amount / total) * 100).toFixed(0) : 0}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full ${d.status === "Paid" ? "bg-ok" : d.status === "Unpaid" ? "bg-crit" : "bg-warn"}`}
              style={{ width: `${total > 0 ? (d.amount / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

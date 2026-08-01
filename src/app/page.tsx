import Link from "next/link";
import {
  Wallet,
  Receipt,
  Package,
  Boxes,
  AlertTriangle,
  Clock,
  Tag,
  Truck,
  Star,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Percent,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { TrendLine } from "@/components/charts/TrendLine";
import { PdfReportButton } from "@/components/PdfReportButton";
import { ExportButton } from "@/components/ExportButton";
import { getOverview, getMonthlyTrend, getInsights } from "@/lib/data";
import { getAvailableBusinessMonths, getSalesForMonth, getProfitAndLoss } from "@/lib/sales";
import { getRestaurantProfile } from "@/lib/settings";
import { formatDate, formatINR, formatMonth, formatNumber, pctChange } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const [months, profile] = await Promise.all([getAvailableBusinessMonths(), getRestaurantProfile()]);

  if (months.length === 0) {
    return (
      <div>
        <PageHeader title="Overview" description={`${profile.name}'s monthly business dashboard`} />
        <EmptyState
          title="No data yet"
          description="Upload a bills PDF or import/record sales to see your dashboard come to life."
        />
      </div>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const [overview, trend, insights, sales, pl] = await Promise.all([
    getOverview(month),
    getMonthlyTrend(),
    getInsights(month),
    getSalesForMonth(month),
    getProfitAndLoss(month),
  ]);

  const change = pctChange(overview.totalSpend, overview.prevSpend);
  const revenueChange = pctChange(sales.totalRevenue, sales.prevRevenue);
  const trendData = trend.map((t) => ({ label: formatMonth(`${t.month}-01`), amount: t.amount }));
  const recentBills = [...overview.bills].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`${profile.name}'s monthly business dashboard`}
        actions={
          <>
            <MonthSelect months={months} value={month} />
            <ExportButton kind="overview" searchParams={{ month }} />
            <PdfReportButton month={month} restaurant={profile} />
          </>
        }
      />

      {insights.length > 0 && (
        <Card className="mb-6 border-brand/20 bg-brand-light/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
              <Lightbulb size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Insights for {formatMonth(`${month}-01`)}</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-foreground/80">
                {insights.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-brand">•</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-muted">Sales & Profitability</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatINR(sales.totalRevenue)}
          icon={TrendingUp}
          change={revenueChange ?? undefined}
          sublabel="vs last month"
        />
        <StatCard
          label="Operating Profit"
          value={formatINR(pl.operatingProfit)}
          icon={pl.operatingProfit >= 0 ? TrendingUp : TrendingDown}
          tone={pl.operatingProfit >= 0 ? "ok" : "crit"}
        />
        <StatCard label="Food Cost %" value={pl.foodCostPct !== null ? `${pl.foodCostPct.toFixed(1)}%` : "—"} icon={Percent} tone={pl.foodCostPct !== null && pl.foodCostPct > 35 ? "warn" : "ok"} />
        <StatCard label="Covers" value={formatNumber(sales.totalCovers)} icon={Users} tone="info" sublabel={sales.avgTicket !== null ? `avg ticket ${formatINR(sales.avgTicket, { decimals: true })}` : undefined} />
      </div>

      <h2 className="mt-6 mb-3 text-sm font-semibold text-muted">Purchases & Inventory</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Monthly Spend"
          value={formatINR(overview.totalSpend)}
          icon={Wallet}
          change={change ?? undefined}
          sublabel="vs last month"
        />
        <StatCard label="Total Bills" value={formatNumber(overview.totalBills)} icon={Receipt} sublabel={`${overview.totalReturns} return(s)`} />
        <StatCard label="Products Tracked" value={formatNumber(overview.totalProductsTracked)} icon={Package} tone="info" />
        <StatCard
          label="Current Stock Value"
          value={formatINR(overview.stockValue)}
          icon={Boxes}
          tone="info"
          sublabel="at last purchase cost"
        />
        <StatCard
          label="Low Stock Items"
          value={formatNumber(overview.lowStockCount)}
          icon={AlertTriangle}
          tone={overview.lowStockCount > 0 ? "warn" : "ok"}
          sublabel={`${overview.outOfStockCount} out of stock`}
        />
        <StatCard
          label="Pending Payments"
          value={formatINR(overview.pendingPayments)}
          icon={Clock}
          tone={overview.pendingPayments > 0 ? "crit" : "ok"}
        />
        <StatCard
          label="Top Category"
          value={overview.topCategory ? CATEGORY_LABELS[overview.topCategory.category] : "—"}
          icon={Tag}
          sublabel={overview.topCategory ? formatINR(overview.topCategory.amount) : undefined}
        />
        <StatCard
          label="Top Vendor"
          value={overview.topVendor?.name ?? "—"}
          icon={Truck}
          sublabel={overview.topVendor ? formatINR(overview.topVendor.amount) : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Spending Trend (all months)" className="lg:col-span-2">
          <TrendLine data={trendData} />
        </Card>
        <Card title="Spend by Category">
          <CategoryDonut data={overview.categorySpend} />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Top Purchased Product" className="lg:col-span-1">
          {overview.topProduct ? (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <Star size={18} />
              </span>
              <div>
                <p className="font-medium">{overview.topProduct.name}</p>
                <p className="text-xs text-muted">
                  {formatNumber(overview.topProduct.qty, 1)} {overview.topProduct.unit} · {formatINR(overview.topProduct.amount)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No purchases this month.</p>
          )}
        </Card>

        <Card
          title="Recent Bills"
          actions={<Link href="/bills" className="text-xs font-medium text-brand hover:underline">View all →</Link>}
          className="lg:col-span-2"
        >
          {recentBills.length === 0 ? (
            <EmptyState title="No bills this month" />
          ) : (
            <div className="divide-y divide-border">
              {recentBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{bill.billNumber}</p>
                    <p className="text-xs text-muted">{formatDate(bill.date)} · {bill.vendor.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={bill.type === "RETURN" ? "crit" : "neutral"}>
                      {bill.type === "RETURN" ? "Return" : formatINR(bill.grandTotal)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {(overview.lowStockItems.length > 0 || overview.outOfStockItems.length > 0) && (
        <Card
          title="Needs Attention"
          className="mt-6"
          actions={<Link href="/inventory" className="text-xs font-medium text-brand hover:underline">View inventory →</Link>}
        >
          <div className="flex flex-wrap gap-2">
            {overview.outOfStockItems.map((p) => (
              <Badge key={p.id} tone="crit">{p.name} · out of stock</Badge>
            ))}
            {overview.lowStockItems.map((p) => (
              <Badge key={p.id} tone="warn">{p.name} · low stock</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

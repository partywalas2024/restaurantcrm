import Link from "next/link";
import { Flame, Flag, PackageX, Hourglass, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getConsumptionOverview, FLAG_META } from "@/lib/consumption";
import { getAvailableBusinessMonths } from "@/lib/sales";
import { requireRestaurantUser } from "@/lib/auth";
import { formatINR, formatMonth, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; flagged?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRestaurantUser();
  const months = await getAvailableBusinessMonths(user.restaurantId);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthList = months.includes(thisMonth) ? months : [thisMonth, ...months];
  // Open on the latest month that has bills or sales, not an empty current month.
  const month = params.month && monthList.includes(params.month) ? params.month : (months[0] ?? thisMonth);
  const onlyFlagged = params.flagged === "1";

  const { rows, totals } = await getConsumptionOverview(user.restaurantId, month);
  const shown = onlyFlagged ? rows.filter((r) => r.flag !== "OK") : rows;
  const hasComparison = (r: (typeof rows)[number]) => r.expectedQty > 0 || r.usedQty > 0 || r.wastedQty > 0;

  return (
    <div>
      <PageHeader
        title="Product Consumption"
        description={`${formatMonth(`${month}-01`)} — what was bought, what was used, and what the recipes say should have been used`}
        actions={<MonthSelect months={monthList} value={month} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Purchases This Month" value={formatINR(totals.purchaseSpend)} icon={Wallet} />
        <StatCard label="Products To Look At" value={totals.flagged} icon={Flag} tone={totals.flagged > 0 ? "warn" : "ok"} />
        <StatCard label="Stock Missing (₹)" value={formatINR(totals.lossValue)} icon={PackageX} tone={totals.lossValue > 0 ? "crit" : "ok"} sublabel={`${totals.shrinkage} product(s) short on count`} />
        <StatCard label="Running Out ≤ 7 Days" value={totals.runningLow} icon={Hourglass} tone={totals.runningLow > 0 ? "warn" : "ok"} />
      </div>

      <Card className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-3xl text-xs text-muted">
            <strong>Bought</strong> comes from bills. <strong>Used</strong> is what staff log in the kitchen, <strong>Wasted</strong> is from the Waste page,
            and <strong>Recipes expect</strong> is sales × each dish&apos;s recipe. A <strong>count variance</strong> is what a physical stock count found
            versus the books (negative = missing). Open a product to log usage or count its stock.
          </p>
          <Link
            href={onlyFlagged ? `/consumption?month=${month}` : `/consumption?month=${month}&flagged=1`}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            {onlyFlagged ? "Show all products" : "Show only flagged"}
          </Link>
        </div>

        {shown.length === 0 ? (
          <EmptyState title={onlyFlagged ? "Nothing flagged this month" : "No product activity yet"} description="Upload bills, then log usage or count stock to see consumption here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3 text-right">Bought</th>
                  <th className="pb-2 pr-3 text-right">Spend</th>
                  <th className="pb-2 pr-3 text-right">Used</th>
                  <th className="pb-2 pr-3 text-right">Wasted</th>
                  <th className="pb-2 pr-3 text-right">Recipes expect</th>
                  <th className="pb-2 pr-3 text-right">Count variance</th>
                  <th className="pb-2 pr-3 text-right">In stock</th>
                  <th className="pb-2 pr-3 text-right">Days left</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const meta = FLAG_META[r.flag];
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link href={`/consumption/${r.id}`} className="font-medium hover:text-brand hover:underline">{r.name}</Link>
                        <span className="ml-1.5 text-xs text-muted">{r.unit}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">{formatNumber(r.purchasedQty, 1)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{formatINR(r.purchaseSpend)}</td>
                      <td className="py-2.5 pr-3 text-right">{r.usedQty > 0 ? formatNumber(r.usedQty, 1) : <span className="text-muted">—</span>}</td>
                      <td className="py-2.5 pr-3 text-right">{r.wastedQty > 0 ? formatNumber(r.wastedQty, 1) : <span className="text-muted">—</span>}</td>
                      <td className="py-2.5 pr-3 text-right">{r.expectedQty > 0 ? formatNumber(r.expectedQty, 1) : <span className="text-muted">—</span>}</td>
                      <td className={`py-2.5 pr-3 text-right ${r.countVariance < 0 ? "font-medium text-crit" : ""}`}>
                        {r.countVariance !== 0 ? `${r.countVariance > 0 ? "+" : ""}${formatNumber(r.countVariance, 1)}` : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right">{formatNumber(r.currentStock, 1)}</td>
                      <td className="py-2.5 pr-3 text-right" title={r.rateBasis ? `Based on ${r.rateBasis === "logged" ? "logged usage (last 30 days)" : r.rateBasis === "recipes" ? "recipe-expected usage (last 30 days)" : "purchases (last 90 days)"}` : undefined}>
                        {r.daysLeft !== null ? (
                          <span className={r.daysLeft <= 7 ? "font-medium text-warn" : ""}>{r.daysLeft > 365 ? "365+" : formatNumber(r.daysLeft, 0)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {hasComparison(r) || r.flag === "SHRINKAGE" ? (
                          <span title={meta.hint}><Badge tone={meta.tone}>{meta.label}</Badge></span>
                        ) : (
                          <span className="text-xs text-muted">no usage data</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Flame size={12} /> &ldquo;Days left&rdquo; uses logged usage when there is some, then recipe-expected usage, then purchases — hover a value to see which.
      </p>
    </div>
  );
}

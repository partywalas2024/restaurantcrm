import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, ShoppingCart, Flame, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getProductConsumption, FLAG_META } from "@/lib/consumption";
import { requireRestaurantUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDate, formatINR, formatMonth, formatNumber } from "@/lib/format";
import { logUsage, recordStockCount, deleteUsage, deleteStockCount } from "@/lib/consumption-actions";

export const dynamic = "force-dynamic";

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export default async function ProductConsumptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantUser();
  const data = await getProductConsumption(user.restaurantId, id);
  if (!data) notFound();
  const { product, monthly, usage, counts, priceHistory, priceRange, totals } = data;
  const owner = isOwner(user.role);
  const today = new Date().toISOString().slice(0, 10);
  const activeMonths = monthly.filter((m) => m.purchasedQty !== 0 || m.usedQty > 0 || m.wastedQty > 0 || m.expectedQty > 0 || m.countVariance !== 0).reverse();

  return (
    <div>
      <Link href="/consumption" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to consumption
      </Link>
      <PageHeader
        title={product.name}
        description={`${CATEGORY_LABELS[product.category]} · measured in ${product.unit}${product.vendor ? ` · usually from ${product.vendor.name}` : ""}`}
        actions={
          <>
            <Link href={`/ledger?product=${product.id}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Full ledger
            </Link>
            <Link href={`/products/${product.id}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Product details
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In Stock Now" value={`${formatNumber(product.currentStock, 1)} ${product.unit}`} icon={Boxes} tone={product.currentStock <= 0 ? "crit" : "default"} />
        <StatCard label="Bought (12 months)" value={`${formatNumber(totals.purchasedQty, 1)} ${product.unit}`} icon={ShoppingCart} tone="info" sublabel={formatINR(totals.spend)} />
        <StatCard label="Used + Wasted (12 months)" value={`${formatNumber(totals.usedQty + totals.wastedQty, 1)} ${product.unit}`} icon={Flame} tone="warn" sublabel={totals.expectedQty > 0 ? `recipes expect ${formatNumber(totals.expectedQty, 1)}` : "no recipe data"} />
        <StatCard
          label="Count Variance"
          value={`${totals.countVariance > 0 ? "+" : ""}${formatNumber(totals.countVariance, 1)} ${product.unit}`}
          icon={ClipboardCheck}
          tone={totals.countVariance < 0 ? "crit" : "ok"}
          sublabel={totals.countVariance < 0 ? `≈ ${formatINR(-totals.countVariance * product.lastCostPrice)} missing` : "found vs books"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Log Usage (manual)">
          <p className="mb-3 text-xs text-muted">
            Recipe dishes already deduct stock when item-wise sales are saved. Use this for extras, prep, or products without recipes.
          </p>
          <form action={logUsage} className="space-y-3">
            <input type="hidden" name="productId" value={product.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="usage-qty">Quantity used ({product.unit}) *</label>
                <input id="usage-qty" name="quantity" type="number" step="any" min="0.001" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL} htmlFor="usage-date">Date *</label>
                <input id="usage-date" name="date" type="date" required defaultValue={today} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="usage-notes">Notes</label>
              <input id="usage-notes" name="notes" placeholder="e.g. Dinner prep, party order" className={INPUT} />
            </div>
            <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Log Usage</button>
          </form>
        </Card>

        <Card title="Physical Stock Count">
          <p className="mb-3 text-xs text-muted">
            Weekly/monthly check: count what is on the shelf. The books say <strong>{formatNumber(product.currentStock, 2)} {product.unit}</strong>;
            the gap is saved as variance and stock is corrected to reality.
          </p>
          <form action={recordStockCount} className="space-y-3">
            <input type="hidden" name="productId" value={product.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="count-qty">Counted quantity ({product.unit}) *</label>
                <input id="count-qty" name="countedQty" type="number" step="any" min="0" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL} htmlFor="count-date">Date *</label>
                <input id="count-date" name="date" type="date" required defaultValue={today} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="count-notes">Notes</label>
              <input id="count-notes" name="notes" placeholder="e.g. Month-end count" className={INPUT} />
            </div>
            <button type="submit" className="w-full rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-light">Save Count</button>
          </form>
        </Card>
      </div>

      <Card title="Month by Month" className="mt-6">
        {activeMonths.length === 0 ? (
          <EmptyState title="No activity in the last 12 months" description="Bills, usage entries, waste and counts will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Month</th>
                  <th className="pb-2 pr-3 text-right">Bought</th>
                  <th className="pb-2 pr-3 text-right">Avg rate</th>
                  <th className="pb-2 pr-3 text-right">Spend</th>
                  <th className="pb-2 pr-3 text-right">Used</th>
                  <th className="pb-2 pr-3 text-right">Wasted</th>
                  <th className="pb-2 pr-3 text-right">Recipes expect</th>
                  <th className="pb-2 pr-3 text-right">Count variance</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeMonths.map((m) => {
                  const meta = FLAG_META[m.flag];
                  const comparable = m.expectedQty > 0 || m.usedQty > 0 || m.wastedQty > 0 || m.countVariance < 0;
                  return (
                    <tr key={m.month} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{formatMonth(`${m.month}-01`)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatNumber(m.purchasedQty, 1)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{m.avgRate !== null ? formatINR(m.avgRate, { decimals: true }) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{formatINR(m.spend)}</td>
                      <td className="py-2.5 pr-3 text-right">{m.usedQty > 0 ? formatNumber(m.usedQty, 1) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right">{m.wastedQty > 0 ? formatNumber(m.wastedQty, 1) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right">{m.expectedQty > 0 ? formatNumber(m.expectedQty, 1) : "—"}</td>
                      <td className={`py-2.5 pr-3 text-right ${m.countVariance < 0 ? "font-medium text-crit" : ""}`}>
                        {m.countVariance !== 0 ? `${m.countVariance > 0 ? "+" : ""}${formatNumber(m.countVariance, 1)}` : "—"}
                      </td>
                      <td className="py-2.5">{comparable ? <span title={meta.hint}><Badge tone={meta.tone}>{meta.label}</Badge></span> : <span className="text-xs text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Usage Log">
          {usage.length === 0 ? (
            <EmptyState title="No usage yet" description="Auto deductions appear when item-wise sales hit dishes with recipes; manual logs appear here too." />
          ) : (
            <div className="divide-y divide-border">
              {usage.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {formatNumber(u.quantity, 2)} {product.unit}
                      {u.isAuto ? <Badge tone="info">Auto</Badge> : <Badge tone="neutral">Manual</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{formatDate(u.date)}{u.notes ? ` · ${u.notes}` : ""}</p>
                  </div>
                  {owner && (
                    <form action={deleteUsage}>
                      <input type="hidden" name="id" value={u.id} />
                      <ConfirmButton
                        message={u.isAuto ? "Remove this auto recipe deduction? Stock goes back up — saving that sales day again will recreate it." : "Remove this usage entry? The stock goes back up."}
                        className="text-xs text-crit hover:underline"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Stock Counts">
          {counts.length === 0 ? (
            <EmptyState title="No counts yet" />
          ) : (
            <div className="divide-y divide-border">
              {counts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      Counted {formatNumber(c.countedQty, 2)} {product.unit}
                      <span className={`ml-2 text-xs ${c.variance < 0 ? "text-crit" : "text-muted"}`}>
                        ({c.variance > 0 ? "+" : ""}{formatNumber(c.variance, 2)} vs books)
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">{formatDate(c.date)}{c.notes ? ` · ${c.notes}` : ""}</p>
                  </div>
                  {owner && (
                    <form action={deleteStockCount}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message="Remove this count? The stock adjustment it made is undone." className="text-xs text-crit hover:underline">Delete</ConfirmButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Purchase Price History" className="mt-6">
        {priceHistory.length === 0 ? (
          <EmptyState title="No purchases in the last 12 months" />
        ) : (
          <>
            {priceRange && (
              <p className="mb-3 text-xs text-muted">
                Paid between {formatINR(priceRange.min, { decimals: true })} and {formatINR(priceRange.max, { decimals: true })} per {product.unit}
                {priceRange.max > priceRange.min ? ` — a ${(((priceRange.max - priceRange.min) / priceRange.min) * 100).toFixed(0)}% swing.` : "."}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Bill</th>
                    <th className="pb-2 pr-3">Vendor</th>
                    <th className="pb-2 pr-3 text-right">Qty</th>
                    <th className="pb-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((p, i) => (
                    <tr key={`${p.billId}-${i}`} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-muted">{formatDate(p.date)}</td>
                      <td className="py-2 pr-3"><Link href={`/bills/${p.billId}`} className="hover:text-brand hover:underline">{p.billNumber}</Link></td>
                      <td className="py-2 pr-3">{p.vendor}</td>
                      <td className="py-2 pr-3 text-right">{formatNumber(p.quantity, 1)} {p.unit}</td>
                      <td className="py-2 text-right font-medium">{formatINR(p.rate, { decimals: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

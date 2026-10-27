import Link from "next/link";
import { ShoppingCart, Wallet, TrendingUp, Flame, Boxes } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getProductLedger, getLedgerSummary, LEDGER_TYPE_LABEL, type LedgerType, type LedgerFilters } from "@/lib/ledger";
import { requireRestaurantUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDate, formatINR, formatMonth, formatNumber } from "@/lib/format";
import type { ProductCategory } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type SP = { product?: string; from?: string; to?: string; type?: string; vendor?: string; category?: string; q?: string };

const TYPES = Object.keys(LEDGER_TYPE_LABEL) as LedgerType[];
const TYPE_TONE: Record<LedgerType, "ok" | "warn" | "crit" | "info" | "neutral"> = {
  PURCHASE: "info", RETURN: "warn", USAGE: "neutral", ADJUSTMENT: "crit", WASTE: "neutral",
};
const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();

  const filters: LedgerFilters = {
    product: sp.product || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    type: TYPES.includes(sp.type as LedgerType) ? (sp.type as LedgerType) : undefined,
    vendor: sp.vendor || undefined,
    category: sp.category && sp.category in CATEGORY_LABELS ? (sp.category as ProductCategory) : undefined,
    q: sp.q || undefined,
  };

  const [products, vendors] = await Promise.all([
    prisma.product.findMany({ where: { restaurantId: user.restaurantId }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { restaurantId: user.restaurantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const ledger = filters.product ? await getProductLedger(user.restaurantId, filters.product, filters) : null;
  const summary = !filters.product ? await getLedgerSummary(user.restaurantId, filters) : null;
  const carry = new URLSearchParams(Object.entries({ from: sp.from, to: sp.to, vendor: sp.vendor }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        title="Product Ledger"
        description="Pick a product to see every purchase, return, use, count and waste entry for it in date order with a running stock balance — or leave it blank to compare all products"
      />

      <Card>
        <form method="GET" className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2">
            <label className={LABEL} htmlFor="l-product">Product</label>
            <select id="l-product" name="product" defaultValue={sp.product ?? ""} className={INPUT}>
              <option value="">All products (summary)</option>
              {products.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.unit})</option>))}
            </select>
          </div>
          <div><label className={LABEL} htmlFor="l-from">From</label><input id="l-from" type="date" name="from" defaultValue={sp.from} className={INPUT} /></div>
          <div><label className={LABEL} htmlFor="l-to">To</label><input id="l-to" type="date" name="to" defaultValue={sp.to} className={INPUT} /></div>
          <div>
            <label className={LABEL} htmlFor="l-vendor">Vendor</label>
            <select id="l-vendor" name="vendor" defaultValue={sp.vendor ?? ""} className={INPUT}>
              <option value="">All vendors</option>
              {vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </div>
          {filters.product ? (
            <div>
              <label className={LABEL} htmlFor="l-type">Entry type</label>
              <select id="l-type" name="type" defaultValue={sp.type ?? ""} className={INPUT}>
                <option value="">All entries</option>
                {TYPES.map((t) => (<option key={t} value={t}>{LEDGER_TYPE_LABEL[t]}</option>))}
              </select>
            </div>
          ) : (
            <div>
              <label className={LABEL} htmlFor="l-cat">Category</label>
              <select id="l-cat" name="category" defaultValue={sp.category ?? ""} className={INPUT}>
                <option value="">All categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          )}
          <div className="col-span-2 sm:col-span-2">
            <label className={LABEL} htmlFor="l-q">Search</label>
            <input id="l-q" name="q" defaultValue={sp.q} placeholder={filters.product ? "bill number, note, vendor…" : "product name…"} className={INPUT} />
          </div>
          <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-3">
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Apply Filters</button>
            <Link href="/ledger" className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">Reset</Link>
          </div>
        </form>
      </Card>

      {ledger && (
        <>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {ledger.product.name} <span className="text-sm font-normal text-muted">measured in {ledger.product.unit}{ledger.product.vendor ? ` · usually from ${ledger.product.vendor.name}` : ""}</span>
            </h2>
            <Link href={`/consumption/${ledger.product.id}`} className="text-sm font-medium text-brand hover:underline">Log usage / stock count →</Link>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Purchases" value={ledger.stats.purchases} icon={ShoppingCart} sublabel={`${formatNumber(ledger.stats.boughtQty, 1)} ${ledger.product.unit} bought`} />
            <StatCard label="Spend" value={formatINR(ledger.stats.spend)} icon={Wallet} tone="info" sublabel={ledger.stats.returnedAmount > 0 ? `${formatINR(ledger.stats.returnedAmount)} returned` : undefined} />
            <StatCard label="Average Rate" value={ledger.stats.avgRate !== null ? formatINR(ledger.stats.avgRate, { decimals: true }) : "—"} icon={TrendingUp} tone="info" sublabel={ledger.stats.minRate !== null && ledger.stats.maxRate !== null ? `${formatINR(ledger.stats.minRate, { decimals: true })} – ${formatINR(ledger.stats.maxRate, { decimals: true })}` : undefined} />
            <StatCard label="Used + Wasted" value={`${formatNumber(ledger.stats.usedQty + ledger.stats.wastedQty, 1)} ${ledger.product.unit}`} icon={Flame} tone="warn" sublabel={`${formatNumber(ledger.stats.usedQty, 1)} used · ${formatNumber(ledger.stats.wastedQty, 1)} wasted`} />
            <StatCard label="In Stock Now" value={`${formatNumber(ledger.product.currentStock, 1)} ${ledger.product.unit}`} icon={Boxes} tone={ledger.product.currentStock <= 0 ? "crit" : "default"} />
          </div>

          {ledger.months.length > 0 && (
            <Card title="Purchases by Month" className="mt-6">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted">
                      <th className="pb-2 pr-3">Month</th><th className="pb-2 pr-3 text-right">Orders</th><th className="pb-2 pr-3 text-right">Quantity</th><th className="pb-2 pr-3 text-right">Avg rate</th><th className="pb-2 text-right">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.months.map((m) => (
                      <tr key={m.month} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">{formatMonth(`${m.month}-01`)}</td>
                        <td className="py-2 pr-3 text-right">{m.count}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(m.qty, 1)} {ledger.product.unit}</td>
                        <td className="py-2 pr-3 text-right text-muted">{m.avgRate !== null ? formatINR(m.avgRate, { decimals: true }) : "—"}</td>
                        <td className="py-2 text-right font-medium">{formatINR(m.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title={`Ledger (${ledger.rows.length} entr${ledger.rows.length === 1 ? "y" : "ies"})`} className="mt-6">
            {ledger.rows.length === 0 ? (
              <EmptyState title="No entries match these filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted">
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Entry</th>
                      <th className="pb-2 pr-3">Vendor / note</th>
                      <th className="pb-2 pr-3 text-right">In</th>
                      <th className="pb-2 pr-3 text-right">Out</th>
                      <th className="pb-2 pr-3 text-right">Rate</th>
                      <th className="pb-2 pr-3 text-right">Amount</th>
                      <th className="pb-2 text-right">Stock after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((e) => (
                      <tr key={e.key} className={`border-b border-border/60 last:border-0 ${e.affectsStock ? "" : "opacity-70"}`}>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{formatDate(e.date)}</td>
                        <td className="py-2.5 pr-3">
                          {e.link ? <Link href={e.link} className="font-medium hover:text-brand hover:underline">{e.title}</Link> : <span className="font-medium">{e.title}</span>}
                          <div className="mt-1"><Badge tone={TYPE_TONE[e.type]}>{LEDGER_TYPE_LABEL[e.type]}</Badge></div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted">{e.vendor ?? ""}{e.vendor && e.note ? " · " : ""}{e.note ?? ""}</td>
                        <td className="py-2.5 pr-3 text-right text-ok">{e.qtyIn > 0 ? formatNumber(e.qtyIn, 2) : ""}</td>
                        <td className="py-2.5 pr-3 text-right">{e.qtyOut > 0 ? formatNumber(e.qtyOut, 2) : ""}</td>
                        <td className="py-2.5 pr-3 text-right text-muted">{e.rate !== null ? formatINR(e.rate, { decimals: true }) : ""}</td>
                        <td className="py-2.5 pr-3 text-right">{e.amount !== null ? formatINR(e.amount, { decimals: true }) : ""}</td>
                        <td className="py-2.5 text-right font-medium">{e.affectsStock ? formatNumber(e.balance, 2) : <span className="text-xs font-normal text-muted">memo</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              Stock after each entry is worked back from today&apos;s stock{ledger.opening !== 0 ? ` (${formatNumber(ledger.opening, 2)} ${ledger.product.unit} before the first entry)` : ""}. Waste rows are memo only — waste doesn&apos;t change stock.
            </p>
          </Card>
        </>
      )}

      {summary && (
        <Card title={`All Products (${summary.rows.length})`} className="mt-6">
          {summary.rows.length === 0 ? (
            <EmptyState title="No products match these filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Product</th>
                    <th className="pb-2 pr-3">Category</th>
                    <th className="pb-2 pr-3 text-right">Orders</th>
                    <th className="pb-2 pr-3 text-right">Bought</th>
                    <th className="pb-2 pr-3 text-right">Avg rate</th>
                    <th className="pb-2 pr-3 text-right">Spend</th>
                    <th className="pb-2 pr-3 text-right">Used</th>
                    <th className="pb-2 pr-3 text-right">Stock</th>
                    <th className="pb-2">Last bought</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link href={`/ledger?product=${r.id}${carry ? `&${carry}` : ""}`} className="font-medium hover:text-brand hover:underline">{r.name}</Link>
                        <span className="ml-1.5 text-xs text-muted">{r.unit}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{CATEGORY_LABELS[r.category]}</td>
                      <td className="py-2.5 pr-3 text-right">{r.purchases}</td>
                      <td className="py-2.5 pr-3 text-right">{formatNumber(r.qty, 1)}</td>
                      <td className="py-2.5 pr-3 text-right text-muted">{r.avgRate !== null ? formatINR(r.avgRate, { decimals: true }) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right font-medium">{formatINR(r.spend)}</td>
                      <td className="py-2.5 pr-3 text-right">{r.used > 0 ? formatNumber(r.used, 1) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right">{formatNumber(r.currentStock, 1)}</td>
                      <td className="whitespace-nowrap py-2.5 text-muted">{r.lastPurchase ? formatDate(r.lastPurchase) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Total spend across these products: <strong>{formatINR(summary.totalSpend)}</strong>. Click a product to open its full ledger.</p>
        </Card>
      )}
    </div>
  );
}

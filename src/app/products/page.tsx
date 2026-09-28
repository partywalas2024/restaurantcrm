import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ExportButton } from "@/components/ExportButton";
import { getProducts } from "@/lib/data";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();
  const products = await getProducts(user.restaurantId);

  const filtered = products
    .filter((p) => (sp.category ? p.category === sp.category : true))
    .filter((p) => (sp.search ? p.name.toLowerCase().includes(sp.search.toLowerCase()) : true))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return (
    <div>
      <PageHeader
        title="Product Catalog"
        description={`${products.length} products tracked across all bills`}
        actions={<ExportButton kind="products" />}
      />

      <Card className="mb-5">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Search</label>
            <input name="search" defaultValue={sp.search} placeholder="Product name" className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Category</label>
            <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
            Apply
          </button>
          <Link href="/products" className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
            Reset
          </Link>
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No products match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3 text-right">Cost Price</th>
                  <th className="pb-2 pr-3 text-right">Qty Purchased</th>
                  <th className="pb-2 pr-3 text-right">Total Spend</th>
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2">Last Bought</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link href={`/products/${p.id}`} className="hover:text-brand hover:underline">{p.name}</Link>
                      {p.isUncertain && <span className="ml-1.5 text-warn" title="Uncertain from extraction">*</span>}
                    </td>
                    <td className="py-2.5 pr-3"><Badge tone="neutral">{CATEGORY_LABELS[p.category]}</Badge></td>
                    <td className="py-2.5 pr-3 text-muted">{p.unit}</td>
                    <td className="py-2.5 pr-3 text-right">{formatINR(p.lastCostPrice, { decimals: true })}</td>
                    <td className="py-2.5 pr-3 text-right">{formatNumber(p.qtyPurchased, 1)} ({p.timesPurchased}x)</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatINR(p.totalSpend)}</td>
                    <td className="py-2.5 pr-3 text-muted">{p.vendorName}</td>
                    <td className="py-2.5 whitespace-nowrap text-muted">{p.lastPurchaseDate ? formatDate(p.lastPurchaseDate) : "—"}</td>
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

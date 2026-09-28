import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ExportButton } from "@/components/ExportButton";
import { StockAdjustForm } from "@/components/StockAdjustForm";
import { getProducts, StockStatus } from "@/lib/data";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { Boxes, AlertTriangle, XCircle, PackagePlus } from "lucide-react";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<StockStatus, string> = {
  HEALTHY: "Healthy",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  OVERSTOCKED: "Overstocked",
};
const STATUS_TONE: Record<StockStatus, "ok" | "warn" | "crit" | "info"> = {
  HEALTHY: "ok",
  LOW_STOCK: "warn",
  OUT_OF_STOCK: "crit",
  OVERSTOCKED: "info",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();
  const products = await getProducts(user.restaurantId);

  const filtered = products.filter((p) => {
    if (sp.category && p.category !== sp.category) return false;
    if (sp.status && p.status !== sp.status) return false;
    if (sp.search && !p.name.toLowerCase().includes(sp.search.toLowerCase())) return false;
    return true;
  });

  const stockValue = products.reduce((s, p) => s + Math.max(p.currentStock, 0) * p.lastCostPrice, 0);
  const lowStock = products.filter((p) => p.status === "LOW_STOCK").length;
  const outOfStock = products.filter((p) => p.status === "OUT_OF_STOCK").length;
  const overstocked = products.filter((p) => p.status === "OVERSTOCKED").length;

  return (
    <div>
      <PageHeader
        title="Inventory Management"
        description="Stock levels inferred from net purchases (purchases minus returns) — adjust manually to match a physical count."
        actions={<ExportButton kind="products" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Stock Value" value={formatINR(stockValue)} icon={Boxes} tone="info" />
        <StatCard label="Low Stock" value={lowStock} icon={AlertTriangle} tone={lowStock > 0 ? "warn" : "ok"} />
        <StatCard label="Out of Stock" value={outOfStock} icon={XCircle} tone={outOfStock > 0 ? "crit" : "ok"} />
        <StatCard label="Overstocked" value={overstocked} icon={PackagePlus} tone="info" />
      </div>

      <Card className="mt-6 mb-5">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Status</label>
            <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
            Apply
          </button>
          <Link href="/inventory" className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
            Reset
          </Link>
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No products match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3 text-right">Stock</th>
                  <th className="pb-2 pr-3 text-right">Reorder Lvl</th>
                  <th className="pb-2 pr-3">Last Purchase</th>
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 align-middle">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link href={`/products/${p.id}`} className="hover:text-brand hover:underline">{p.name}</Link>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{CATEGORY_LABELS[p.category]}</td>
                    <td className="py-2.5 pr-3 text-muted">{p.unit}</td>
                    <td className="py-2.5 pr-3 text-right">{formatNumber(p.currentStock, 1)}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{formatNumber(p.reorderLevel, 1)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{p.lastPurchaseDate ? formatDate(p.lastPurchaseDate) : "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{p.vendorName}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="py-2.5">
                      <StockAdjustForm productId={p.id} />
                    </td>
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

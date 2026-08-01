import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { prisma } from "@/lib/prisma";
import { formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { updateProduct } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      vendor: true,
      lineItems: { include: { bill: true }, orderBy: { bill: { date: "desc" } } },
    },
  });
  if (!product) notFound();

  return (
    <div>
      <Link href="/products" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to products
      </Link>
      <PageHeader title={product.name} description={`${CATEGORY_LABELS[product.category]} · ${product.unit}`} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Purchase History" className="lg:col-span-2">
          {product.lineItems.length === 0 ? (
            <EmptyState title="No purchases recorded" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Bill</th>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3 text-right">Qty</th>
                    <th className="pb-2 pr-3 text-right">Rate</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {product.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/bills/${li.bill.id}`} className="hover:text-brand hover:underline">{li.bill.billNumber}</Link>
                      </td>
                      <td className="py-2 pr-3 text-muted">{formatDate(li.bill.date)}</td>
                      <td className="py-2 pr-3 text-right">{li.quantity}</td>
                      <td className="py-2 pr-3 text-right">{formatINR(li.rate, { decimals: true })}</td>
                      <td className="py-2 text-right font-medium">{formatINR(li.amount, { decimals: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Product Details">
          <form action={updateProduct} className="space-y-4">
            <input type="hidden" name="id" value={product.id} />
            {product.isUncertain && (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                This product name/category was uncertain during extraction — please verify.
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Name</label>
              <input name="name" defaultValue={product.name} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Category</label>
              <select name="category" defaultValue={product.category} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
              <input name="unit" defaultValue={product.unit} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Current Stock</label>
                <input type="number" step="any" name="currentStock" defaultValue={product.currentStock} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Reorder Level</label>
                <input type="number" step="any" name="reorderLevel" defaultValue={product.reorderLevel} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
            </div>
            <p className="text-xs text-muted">Vendor: {product.vendor?.name ?? "—"} · Last cost: {formatINR(product.lastCostPrice, { decimals: true })}</p>
            <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Save Changes
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

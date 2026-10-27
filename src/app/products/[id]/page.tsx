import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { updateProduct, deleteProduct } from "@/lib/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { isOwner } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireRestaurantUser();
  const product = await prisma.product.findFirst({
    where: { id, restaurantId: user.restaurantId },
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
      <PageHeader
        title={product.name}
        description={`${CATEGORY_LABELS[product.category]} · ${product.unit}`}
        actions={
          <>
            <Link href={`/ledger?product=${product.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Full ledger
            </Link>
            <Link href={`/consumption/${product.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Consumption &amp; stock count
            </Link>
          </>
        }
      />
      {error && <p className="mb-4 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">{error}</p>}

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
          {isOwner(user.role) ? (
            <>
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
              <form action={deleteProduct} className="mt-3 border-t border-border pt-3">
                <input type="hidden" name="id" value={product.id} />
                <ConfirmButton
                  message={`Delete ${product.name}? This can't be undone.`}
                  className="w-full rounded-lg border border-crit/30 px-4 py-2 text-sm font-medium text-crit hover:bg-crit-bg"
                >
                  Delete Product
                </ConfirmButton>
                <p className="mt-1.5 text-xs text-muted">Only possible if it has no purchases, recipes or waste entries.</p>
              </form>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted">Current stock:</span> {product.currentStock} {product.unit}</p>
              <p><span className="text-muted">Reorder level:</span> {product.reorderLevel}</p>
              <p><span className="text-muted">Vendor:</span> {product.vendor?.name ?? "—"}</p>
              <p><span className="text-muted">Last cost:</span> {formatINR(product.lastCostPrice, { decimals: true })}</p>
              <p className="pt-1 text-xs text-muted">Only the owner can edit or delete products. Use &ldquo;Consumption &amp; stock count&rdquo; to record usage or a physical count.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

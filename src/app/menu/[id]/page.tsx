import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { getMenuItemById, computeRecipeCost } from "@/lib/sales";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatINR } from "@/lib/format";
import { updateMenuItem, deleteMenuItem, addRecipeIngredient, removeRecipeIngredient } from "@/lib/sales-actions";

export const dynamic = "force-dynamic";

export default async function MenuItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantUser();
  const [item, products] = await Promise.all([
    getMenuItemById(user.restaurantId, id),
    prisma.product.findMany({ where: { restaurantId: user.restaurantId }, orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();
  const owner = isOwner(user.role);

  const cost = computeRecipeCost(item.recipe);
  const margin = item.sellingPrice - cost;
  const marginPct = item.sellingPrice > 0 ? (margin / item.sellingPrice) * 100 : null;

  return (
    <div>
      <Link href="/menu" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to menu
      </Link>
      <PageHeader title={item.name} description={item.category ?? undefined} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Recipe" className="lg:col-span-2">
          {item.recipe.length === 0 ? (
            <EmptyState title="No recipe yet" description="Add ingredients below to compute this dish's cost and margin automatically." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Ingredient</th>
                    <th className="pb-2 pr-3 text-right">Qty</th>
                    <th className="pb-2 pr-3">Unit</th>
                    <th className="pb-2 pr-3 text-right">Cost</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {item.recipe.map((ri) => (
                    <tr key={ri.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">{ri.product.name}</td>
                      <td className="py-2 pr-3 text-right">{ri.quantity}</td>
                      <td className="py-2 pr-3 text-muted">{ri.unit}</td>
                      <td className="py-2 pr-3 text-right">{formatINR(ri.quantity * ri.product.lastCostPrice, { decimals: true })}</td>
                      <td className="py-2">
                        {owner && (
                          <form action={removeRecipeIngredient}>
                            <input type="hidden" name="id" value={ri.id} />
                            <input type="hidden" name="menuItemId" value={item.id} />
                            <ConfirmButton message={`Remove ${ri.product.name} from this recipe?`} className="text-crit hover:opacity-70" aria-label="Remove ingredient">
                              <Trash2 size={14} />
                            </ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form action={addRecipeIngredient} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <input type="hidden" name="menuItemId" value={item.id} />
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">Ingredient</label>
              <select name="productId" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-muted">Qty</label>
              <input type="number" name="quantity" step="any" min="0" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
              <input name="unit" placeholder="e.g. KG" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Add
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Use the same unit the ingredient is purchased in (check the Product Catalog) — e.g. if bought in KG, enter 0.05 for 50g.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <p className="text-muted">Recipe Cost</p>
              <p className="text-lg font-semibold">{formatINR(cost, { decimals: true })}</p>
            </div>
            <div>
              <p className="text-muted">Margin</p>
              <p className="text-lg font-semibold">{formatINR(margin, { decimals: true })}</p>
            </div>
            <div>
              <p className="text-muted">Margin %</p>
              <p className="text-lg font-semibold">{marginPct !== null ? `${marginPct.toFixed(1)}%` : "—"}</p>
            </div>
          </div>
        </Card>

        <Card title="Item Details">
          {owner ? (
            <>
              <form action={updateMenuItem} className="space-y-3">
                <input type="hidden" name="id" value={item.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Name</label>
                  <input name="name" defaultValue={item.name} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Category</label>
                  <input name="category" defaultValue={item.category ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Selling Price (₹)</label>
                  <input type="number" name="sellingPrice" step="any" min="0" defaultValue={item.sellingPrice} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={item.active} className="rounded border-border" />
                  Active on menu
                </label>
                <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                  Save Changes
                </button>
              </form>

              <form action={deleteMenuItem} className="mt-3 border-t border-border pt-3">
                <input type="hidden" name="id" value={item.id} />
                <ConfirmButton message={`Delete ${item.name} from the menu?`} className="w-full rounded-lg border border-crit/30 px-4 py-2 text-sm font-medium text-crit hover:bg-crit-bg">
                  Delete Menu Item
                </ConfirmButton>
                <p className="mt-1.5 text-xs text-muted">Only possible if this item has no recorded sales.</p>
              </form>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted">Name:</span> {item.name}</p>
              <p><span className="text-muted">Category:</span> {item.category ?? "—"}</p>
              <p><span className="text-muted">Selling price:</span> {formatINR(item.sellingPrice, { decimals: true })}</p>
              <p><span className="text-muted">Status:</span> {item.active ? "Active" : "Inactive"}</p>
              <p className="pt-1 text-xs text-muted">Only the owner can edit or delete menu items and remove recipe ingredients.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

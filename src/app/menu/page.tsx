import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getMenuItems } from "@/lib/sales";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const items = await getMenuItems();

  return (
    <div>
      <PageHeader
        title="Menu & Recipe Costing"
        description="Every dish, its recipe cost (from real ingredient prices), and margin"
        actions={
          <Link href="/menu/new" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
            <Plus size={14} /> Add Menu Item
          </Link>
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState title="No menu items yet" description="Add a dish, or import a PetPooja sales export — items are created automatically from it." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Item</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3 text-right">Selling Price</th>
                  <th className="pb-2 pr-3 text-right">Recipe Cost</th>
                  <th className="pb-2 pr-3 text-right">Margin</th>
                  <th className="pb-2 pr-3 text-right">Margin %</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link href={`/menu/${item.id}`} className="hover:text-brand hover:underline">{item.name}</Link>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{item.category ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right">{formatINR(item.sellingPrice, { decimals: true })}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {item.hasRecipe ? formatINR(item.cost, { decimals: true }) : <span className="text-muted">no recipe</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{item.hasRecipe ? formatINR(item.margin, { decimals: true }) : "—"}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {item.marginPct !== null && item.hasRecipe ? (
                        <Badge tone={item.marginPct >= 50 ? "ok" : item.marginPct >= 20 ? "warn" : "crit"}>{item.marginPct.toFixed(0)}%</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5">
                      <Badge tone={item.active ? "ok" : "neutral"}>{item.active ? "Active" : "Inactive"}</Badge>
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

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { createMenuItem } from "@/lib/sales-actions";

export default function NewMenuItemPage() {
  return (
    <div>
      <Link href="/menu" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to menu
      </Link>
      <PageHeader title="Add Menu Item" description="Add its recipe (ingredients) on the next screen to get automatic cost & margin." />

      <Card className="max-w-lg">
        <form action={createMenuItem} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Item Name *</label>
            <input name="name" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" placeholder="e.g. Paneer Butter Masala" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Category</label>
            <input name="category" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" placeholder="e.g. Main Course" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Selling Price (₹) *</label>
            <input type="number" name="sellingPrice" step="any" min="0" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Add Menu Item
          </button>
        </form>
      </Card>
    </div>
  );
}

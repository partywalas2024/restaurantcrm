import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { createVendor } from "@/lib/actions";

export default function NewVendorPage() {
  return (
    <div>
      <Link href="/vendors" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to vendors
      </Link>
      <PageHeader title="Add Vendor" description="Add a supplier manually — you can also add vendors automatically by uploading their bills." />

      <Card className="max-w-lg">
        <form action={createVendor} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Vendor Name *</label>
            <input name="name" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" placeholder="e.g. Sharma Trading Co." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <input name="phone" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Address</label>
            <textarea name="address" rows={3} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">GSTIN</label>
            <input name="gstin" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
            <textarea name="notes" rows={2} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Add Vendor
          </button>
        </form>
      </Card>
    </div>
  );
}

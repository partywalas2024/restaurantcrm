import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { prisma } from "@/lib/prisma";
import { requireRestaurantAdmin } from "@/lib/auth";
import { updateVendor } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantAdmin();
  const vendor = await prisma.vendor.findFirst({ where: { id, restaurantId: user.restaurantId } });
  if (!vendor) notFound();

  return (
    <div>
      <Link href={`/vendors/${vendor.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to {vendor.name}
      </Link>
      <PageHeader title="Edit Vendor" description="Changes apply everywhere this vendor appears — bills, ledger, and reports." />

      <Card className="max-w-lg">
        <form action={updateVendor} className="space-y-4">
          <input type="hidden" name="id" value={vendor.id} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Vendor Name *</label>
            <input name="name" required defaultValue={vendor.name} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <input name="phone" defaultValue={vendor.phone ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Address</label>
            <textarea name="address" defaultValue={vendor.address ?? ""} rows={3} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">GSTIN</label>
            <input name="gstin" defaultValue={vendor.gstin ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
            <textarea name="notes" defaultValue={vendor.notes ?? ""} rows={2} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Save Changes
            </button>
            <Link href={`/vendors/${vendor.id}`} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

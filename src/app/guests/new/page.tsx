import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { createCustomer } from "@/lib/customer-actions";

export default function NewGuestPage() {
  return (
    <div>
      <Link href="/guests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to guests
      </Link>
      <PageHeader title="Add Guest" description="Phone number is how repeat guests get recognized — the rest is optional." />

      <Card className="max-w-lg">
        <form action={createCustomer} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Name *</label>
            <input name="name" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone *</label>
            <input name="phone" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" placeholder="e.g. 9876543210" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Email</label>
            <input name="email" type="email" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="whatsappOptIn" className="rounded border-border" />
            OK to message on WhatsApp
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Birthday</label>
              <input type="date" name="birthday" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Anniversary</label>
              <input type="date" name="anniversary" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Dietary Notes</label>
            <input name="dietaryNotes" placeholder="e.g. Vegan, nut allergy" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
            <textarea name="notes" rows={2} placeholder="e.g. Prefers window seat" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Add Guest
          </button>
        </form>
      </Card>
    </div>
  );
}

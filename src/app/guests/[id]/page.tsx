import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, Cake, Heart, MessageCircle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { getCustomerById, SEGMENT_TONE, SEGMENT_DESCRIPTION } from "@/lib/customers";
import { requireRestaurantUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { ConfirmButton } from "@/components/ConfirmButton";
import { formatDate, formatINR } from "@/lib/format";
import { updateCustomer, deleteCustomer, logCustomerVisit, deleteCustomerVisit } from "@/lib/customer-actions";

export const dynamic = "force-dynamic";

export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantUser();
  const guest = await getCustomerById(user.restaurantId, id);
  if (!guest) notFound();
  const owner = isOwner(user.role);

  return (
    <div>
      <Link href="/guests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to guests
      </Link>
      <PageHeader title={guest.name} />
      <div className="mb-6 -mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1"><Phone size={12} />{guest.phone}</span>
        {guest.email && <span className="inline-flex items-center gap-1"><Mail size={12} />{guest.email}</span>}
        {guest.whatsappOptIn && <Badge tone="ok"><MessageCircle size={11} className="mr-0.5 inline" />WhatsApp OK</Badge>}
        {guest.visitCount > 0 && (
          <span title={SEGMENT_DESCRIPTION[guest.segment]}>
            <Badge tone={SEGMENT_TONE[guest.segment]}>{guest.segment}</Badge>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Visits Logged" value={guest.visitCount} icon={Cake} />
        <StatCard label="Total Spend" value={formatINR(guest.totalSpend)} icon={Heart} tone="info" />
        <StatCard label="Avg / Visit" value={guest.avgSpend !== null ? formatINR(guest.avgSpend, { decimals: true }) : "—"} icon={Cake} tone="info" />
      </div>

      {guest.visitCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          RFM rank (1–5, relative to your other guests) — Recency {guest.rScore}, Frequency {guest.fScore}, Monetary {guest.mScore}.{" "}
          {SEGMENT_DESCRIPTION[guest.segment]}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Visit History" className="lg:col-span-2">
          {guest.visits.length === 0 ? (
            <EmptyState title="No visits logged yet" description="Log a visit to start building this guest's history." />
          ) : (
            <div className="divide-y divide-border">
              {guest.visits.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{formatDate(v.date)}{v.covers ? ` · ${v.covers} cover(s)` : ""}</p>
                    {v.notes && <p className="text-xs text-muted">{v.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatINR(v.amount, { decimals: true })}</span>
                    {owner && (
                      <form action={deleteCustomerVisit}>
                        <input type="hidden" name="id" value={v.id} />
                        <ConfirmButton message="Delete this logged visit?" className="text-crit hover:opacity-70" aria-label="Delete visit">
                          <Trash2 size={14} />
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={logCustomerVisit} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <input type="hidden" name="customerId" value={guest.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date</label>
              <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-muted">Amount (₹)</label>
              <input type="number" name="amount" step="any" min="0" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div className="w-20">
              <label className="mb-1 block text-xs font-medium text-muted">Covers</label>
              <input type="number" name="covers" min="0" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
              <input name="notes" placeholder="Optional" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Log Visit
            </button>
          </form>
        </Card>

        <Card title="Guest Details">
          {owner ? (
            <>
              <form action={updateCustomer} className="space-y-3">
                <input type="hidden" name="id" value={guest.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Name</label>
                  <input name="name" defaultValue={guest.name} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
                  <input name="phone" defaultValue={guest.phone} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                  <input name="email" type="email" defaultValue={guest.email ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="whatsappOptIn" defaultChecked={guest.whatsappOptIn} className="rounded border-border" />
                  OK to message on WhatsApp
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Birthday</label>
                    <input type="date" name="birthday" defaultValue={guest.birthday ? guest.birthday.toISOString().slice(0, 10) : ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Anniversary</label>
                    <input type="date" name="anniversary" defaultValue={guest.anniversary ? guest.anniversary.toISOString().slice(0, 10) : ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Dietary Notes</label>
                  <input name="dietaryNotes" defaultValue={guest.dietaryNotes ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                  <textarea name="notes" rows={3} defaultValue={guest.notes ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                  Save Changes
                </button>
              </form>

              <form action={deleteCustomer} className="mt-3 border-t border-border pt-3">
                <input type="hidden" name="id" value={guest.id} />
                <ConfirmButton message={`Delete ${guest.name} and all their logged visits?`} className="w-full rounded-lg border border-crit/30 px-4 py-2 text-sm font-medium text-crit hover:bg-crit-bg">
                  Delete Guest
                </ConfirmButton>
              </form>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted">Phone:</span> {guest.phone}</p>
              {guest.email && <p><span className="text-muted">Email:</span> {guest.email}</p>}
              {guest.dietaryNotes && <p><span className="text-muted">Dietary:</span> {guest.dietaryNotes}</p>}
              {guest.notes && <p><span className="text-muted">Notes:</span> {guest.notes}</p>}
              <p className="pt-1 text-xs text-muted">Only the owner can edit or delete guests. You can log visits.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

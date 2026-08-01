import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Wallet, Receipt, CreditCard, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { LedgerExportButtons } from "@/components/LedgerExportButtons";
import { ReceiptButton } from "@/components/ReceiptButton";
import { getVendorLedger } from "@/lib/data";
import { getRestaurantProfile } from "@/lib/settings";
import { formatDate, formatINR } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { recordPayment, deletePayment } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ledger, profile] = await Promise.all([getVendorLedger(id).catch(() => null), getRestaurantProfile()]);
  if (!ledger) notFound();
  const { vendor, entries, totalDebit, totalCredit, balance } = ledger;

  return (
    <div>
      <Link href="/vendors" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to vendors
      </Link>
      <PageHeader
        title={vendor.name}
        description={vendor.gstin ? `GSTIN: ${vendor.gstin}` : undefined}
        actions={
          <>
            <Link
              href={`/vendors/${vendor.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              <Pencil size={14} /> Edit Vendor
            </Link>
            <LedgerExportButtons vendorId={vendor.id} vendorName={vendor.name} restaurant={profile} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Billed" value={formatINR(totalDebit)} icon={Receipt} />
        <StatCard label="Total Paid / Credited" value={formatINR(totalCredit)} icon={CreditCard} tone="ok" />
        <StatCard
          label={balance > 0.005 ? "You Owe" : balance < -0.005 ? "Vendor Owes You" : "Settled"}
          value={formatINR(Math.abs(balance))}
          icon={Scale}
          tone={balance > 0.005 ? "warn" : balance < -0.005 ? "info" : "ok"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Ledger" className="lg:col-span-2">
          {entries.length === 0 ? (
            <EmptyState title="No transactions yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Particulars</th>
                    <th className="pb-2 pr-3 text-right">Debit</th>
                    <th className="pb-2 pr-3 text-right">Credit</th>
                    <th className="pb-2 pr-3 text-right">Balance</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted">{formatDate(e.date)}</td>
                      <td className="py-2 pr-3">
                        {e.type === "BILL" ? (
                          <Link href={`/bills/${e.id}`} className="hover:text-brand hover:underline">
                            {e.particulars}
                          </Link>
                        ) : (
                          e.particulars
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{e.debit > 0 ? formatINR(e.debit, { decimals: true }) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-ok">{e.credit > 0 ? formatINR(e.credit, { decimals: true }) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatINR(e.balance, { decimals: true })}</td>
                      <td className="py-2 whitespace-nowrap">
                        {e.type === "PAYMENT" && (
                          <div className="flex items-center gap-2">
                            <ReceiptButton paymentId={e.id} />
                            <form action={deletePayment}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="vendorId" value={vendor.id} />
                              <button type="submit" className="text-xs text-crit hover:underline">
                                Delete
                              </button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Record Payment">
          <form action={recordPayment} className="space-y-3">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Date</label>
              <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Amount (₹)</label>
              <input type="number" name="amount" step="any" min="0.01" required className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Method</label>
              <select name="method" defaultValue="BANK_TRANSFER" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Reference (optional)</label>
              <input name="reference" placeholder="Cheque #, txn ID..." className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
              <textarea name="notes" rows={2} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
            </div>
            <button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ok px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              <Wallet size={14} /> Record Payment
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

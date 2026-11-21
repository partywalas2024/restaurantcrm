import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Wallet, Receipt, CreditCard, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { LedgerExportButtons } from "@/components/LedgerExportButtons";
import { ReceiptButton } from "@/components/ReceiptButton";
import { cleanDay, getVendorLedger } from "@/lib/data";
import { getRestaurant } from "@/lib/settings";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { recordPayment, deletePayment, deleteVendor } from "@/lib/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { isOwner } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const from = cleanDay(sp.from);
  const to = cleanDay(sp.to);
  const user = await requireRestaurantUser();
  const [ledger, profile] = await Promise.all([
    getVendorLedger(user.restaurantId, id, { from, to }),
    getRestaurant(user.restaurantId),
  ]);
  if (!ledger) notFound();
  const { vendor, entries, totalDebit, totalCredit, balance } = ledger;
  const owner = isOwner(user.role);

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
            {owner && (
              <>
                <Link
                  href={`/vendors/${vendor.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
                >
                  <Pencil size={14} /> Edit Vendor
                </Link>
                <form action={deleteVendor}>
                  <input type="hidden" name="id" value={vendor.id} />
                  <ConfirmButton
                    message={`Delete vendor ${vendor.name}? Only possible when it has no bills or payments.`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-crit/30 bg-surface px-3 py-1.5 text-sm font-medium text-crit hover:bg-crit-bg"
                  >
                    Delete Vendor
                  </ConfirmButton>
                </form>
              </>
            )}
            <LedgerExportButtons vendorId={vendor.id} vendorName={vendor.name} restaurant={profile} from={ledger.from} to={ledger.to} />
          </>
        }
      />

      {sp.error && <p className="mb-4 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">{sp.error}</p>}

      <Card className="mb-6">
        <form method="GET" className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="v-from">From</label>
            <input id="v-from" type="date" name="from" defaultValue={from} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="v-to">To</label>
            <input id="v-to" type="date" name="to" defaultValue={to} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Apply Filters
            </button>
            <Link href={`/vendors/${vendor.id}`} className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={ledger.period ? "Billed in period" : "Total Billed"}
          value={formatINR(totalDebit)}
          icon={Receipt}
          sublabel={ledger.period ?? undefined}
        />
        <StatCard
          label={ledger.period ? "Paid in period" : "Total Paid / Credited"}
          value={formatINR(totalCredit)}
          icon={CreditCard}
          tone="ok"
          sublabel={ledger.period ?? undefined}
        />
        <StatCard
          label={balance > 0.005 ? "You Owe" : balance < -0.005 ? "Vendor Owes You" : "Settled"}
          value={formatINR(Math.abs(balance))}
          icon={Scale}
          tone={balance > 0.005 ? "warn" : balance < -0.005 ? "info" : "ok"}
          sublabel={ledger.period ? "Current outstanding" : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title={ledger.period ? `Ledger · ${ledger.period}` : "Ledger"} className="lg:col-span-2">
          {entries.length === 0 && ledger.openingBalance === null ? (
            <EmptyState
              title={ledger.period ? "No transactions in this period" : "No transactions yet"}
              description={ledger.period ? "Try a wider date range, or reset to see the full ledger." : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              {ledger.period && entries.length === 0 && (
                <p className="mb-3 text-xs text-muted">No bills or payments in this period. The balance below was already on the books before the From date.</p>
              )}
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
                  {ledger.openingBalance !== null && (
                    <tr className="border-b border-border/60">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted">{ledger.from ? formatDate(ledger.from) : "—"}</td>
                      <td className="py-2 pr-3 text-muted">Opening balance</td>
                      <td className="py-2 pr-3 text-right">—</td>
                      <td className="py-2 pr-3 text-right">—</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatINR(ledger.openingBalance, { decimals: true })}</td>
                      <td />
                    </tr>
                  )}
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
                            {owner && (
                              <form action={deletePayment}>
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="vendorId" value={vendor.id} />
                                <ConfirmButton message="Delete this payment? The vendor balance will go back up." className="text-xs text-crit hover:underline">
                                  Delete
                                </ConfirmButton>
                              </form>
                            )}
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

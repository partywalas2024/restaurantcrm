import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getBillById } from "@/lib/data";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { updateBill, deleteBill, updateBillLineItem, deleteBillLineItem } from "@/lib/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { isOwner } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantUser();
  const bill = await getBillById(user.restaurantId, id);
  if (!bill) notFound();
  const owner = isOwner(user.role);
  const INPUT = "w-full rounded-md border border-border bg-surface px-2 py-1 text-sm";

  return (
    <div>
      <Link href="/bills" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to bills
      </Link>
      <PageHeader
        title={`Bill ${bill.billNumber}`}
        description={`${bill.vendor.name} · ${formatDate(bill.date)}`}
        actions={<Badge tone={bill.type === "RETURN" ? "crit" : "neutral"}>{bill.type === "RETURN" ? "Sales Return" : "Tax Invoice"}</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Line Items">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3 text-right">Qty</th>
                  <th className="pb-2 pr-3 text-right">Rate</th>
                  <th className="pb-2 text-right">Amount</th>
                  {owner && <th className="pb-2 pl-3" />}
                </tr>
              </thead>
              <tbody>
                {bill.lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{li.productNameRaw}</td>
                    {owner ? (
                      <>
                        <td className="py-2 pr-3"><input form={`edit-${li.id}`} name="unit" defaultValue={li.unit} className={`${INPUT} w-20`} /></td>
                        <td className="py-2 pr-3"><input form={`edit-${li.id}`} name="quantity" type="number" step="any" min="0" defaultValue={li.quantity} className={`${INPUT} w-24 text-right`} /></td>
                        <td className="py-2 pr-3"><input form={`edit-${li.id}`} name="rate" type="number" step="any" min="0" defaultValue={li.rate} className={`${INPUT} w-24 text-right`} /></td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 text-muted">{li.unit}</td>
                        <td className="py-2 pr-3 text-right">{li.quantity}</td>
                        <td className="py-2 pr-3 text-right">{formatINR(li.rate, { decimals: true })}</td>
                      </>
                    )}
                    <td className="py-2 text-right font-medium">{formatINR(li.amount, { decimals: true })}</td>
                    {owner && (
                      <td className="py-2 pl-3">
                        <form id={`edit-${li.id}`} action={updateBillLineItem}><input type="hidden" name="lineItemId" value={li.id} /></form>
                        <form id={`del-${li.id}`} action={deleteBillLineItem}><input type="hidden" name="lineItemId" value={li.id} /></form>
                        <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium">
                          <button type="submit" form={`edit-${li.id}`} className="text-brand hover:underline">Save</button>
                          {bill.lineItems.length > 1 && (
                            <ConfirmButton form={`del-${li.id}`} message={`Remove "${li.productNameRaw}" from this bill? Stock is reversed.`} className="text-crit hover:underline">
                              Delete
                            </ConfirmButton>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {owner && <p className="mt-2 text-xs text-muted">Change a quantity or rate and press Save — stock, the bill total and the product&apos;s last cost update with it.</p>}
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatINR(bill.subtotal, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>SGST</span><span>{formatINR(bill.sgst, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>CGST</span><span>{formatINR(bill.cgst, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>Round off</span><span>{formatINR(bill.roundoff, { decimals: true })}</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold"><span>Grand Total</span><span>{formatINR(bill.grandTotal, { decimals: true })}</span></div>
          </div>
        </Card>

        <Card title="Bill Details">
          {owner ? (
            <>
              <form action={updateBill} className="space-y-4">
                <input type="hidden" name="id" value={bill.id} />
                {bill.isUncertain && (
                  <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                    One or more fields on this bill were uncertain during extraction — please verify.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Bill Date</label>
                    <input type="date" name="date" defaultValue={bill.date.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Due Date</label>
                    <input type="date" name="dueDate" defaultValue={bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Bill Number</label>
                  <input name="billNumber" defaultValue={bill.billNumber} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Category</label>
                  <select name="category" defaultValue={bill.category} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Payment Status</label>
                  <select name="paymentStatus" defaultValue={bill.paymentStatus} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
                    <option value="PAID">Paid</option>
                    <option value="UNPAID">Unpaid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="UNKNOWN">Unknown (assumed paid)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                  <textarea name="notes" defaultValue={bill.notes ?? ""} rows={3} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
                </div>
                <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                  Save Changes
                </button>
              </form>
              <form action={deleteBill} className="mt-3 border-t border-border pt-3">
                <input type="hidden" name="id" value={bill.id} />
                <ConfirmButton
                  message={`Delete bill ${bill.billNumber} (${bill.vendor.name})? All its stock movements are reversed. This can't be undone.`}
                  className="w-full rounded-lg border border-crit/30 px-4 py-2 text-sm font-medium text-crit hover:bg-crit-bg"
                >
                  Delete Bill
                </ConfirmButton>
                <p className="mt-1.5 text-xs text-muted">Use this for a duplicate upload. Stock goes back to what it was before this bill.</p>
              </form>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {bill.isUncertain && (
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">One or more fields on this bill were uncertain during extraction — ask the owner to verify.</p>
              )}
              <p><span className="text-muted">Bill number:</span> {bill.billNumber}</p>
              <p><span className="text-muted">Date:</span> {formatDate(bill.date)}</p>
              <p><span className="text-muted">Category:</span> {CATEGORY_LABELS[bill.category]}</p>
              <p><span className="text-muted">Payment:</span> {bill.paymentStatus}</p>
              {bill.notes && <p><span className="text-muted">Notes:</span> {bill.notes}</p>}
              <p className="pt-1 text-xs text-muted">Spotted a mistake or a duplicate? Tell the owner — only they can edit or delete bills.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

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
import { updateBill } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantUser();
  const bill = await getBillById(user.restaurantId, id);
  if (!bill) notFound();

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
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Product</th>
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3 text-right">Qty</th>
                  <th className="pb-2 pr-3 text-right">Rate</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{li.productNameRaw}</td>
                    <td className="py-2 pr-3 text-muted">{li.unit}</td>
                    <td className="py-2 pr-3 text-right">{li.quantity}</td>
                    <td className="py-2 pr-3 text-right">{formatINR(li.rate, { decimals: true })}</td>
                    <td className="py-2 text-right font-medium">{formatINR(li.amount, { decimals: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatINR(bill.subtotal, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>SGST</span><span>{formatINR(bill.sgst, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>CGST</span><span>{formatINR(bill.cgst, { decimals: true })}</span></div>
            <div className="flex justify-between text-muted"><span>Round off</span><span>{formatINR(bill.roundoff, { decimals: true })}</span></div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold"><span>Grand Total</span><span>{formatINR(bill.grandTotal, { decimals: true })}</span></div>
          </div>
        </Card>

        <Card title="Bill Details">
          <form action={updateBill} className="space-y-4">
            <input type="hidden" name="id" value={bill.id} />
            {bill.isUncertain && (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                One or more fields on this bill were uncertain during extraction — please verify.
              </p>
            )}
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
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { getBills } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { ExportButton } from "@/components/ExportButton";
import type { ProductCategory } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const HIGH_VALUE_THRESHOLD = 60000;

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();
  const vendors = await prisma.vendor.findMany({ where: { restaurantId: user.restaurantId }, orderBy: { name: "asc" } });

  const bills = await getBills(user.restaurantId, {
    vendorId: sp.vendorId || undefined,
    category: (sp.category as ProductCategory) || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    minAmount: sp.minAmount ? Number(sp.minAmount) : undefined,
    maxAmount: sp.maxAmount ? Number(sp.maxAmount) : undefined,
    search: sp.search || undefined,
    paymentStatus: sp.paymentStatus || undefined,
  });

  const totalAmount = bills.reduce((s, b) => s + (b.type === "RETURN" ? -b.grandTotal : b.grandTotal), 0);

  return (
    <div>
      <PageHeader
        title="Bills & Purchases"
        description={`${bills.length} bill${bills.length === 1 ? "" : "s"} · ${formatINR(totalAmount)} total`}
        actions={
          <>
            <Link
              href="/bills/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              <Plus size={15} /> Add Bill
            </Link>
            <ExportButton kind="bills" searchParams={sp} />
          </>
        }
      />

      <Card className="mb-5">
        <form method="GET" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted">Search</label>
            <input
              name="search"
              defaultValue={sp.search}
              placeholder="Bill # or notes"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Vendor</label>
            <select name="vendorId" defaultValue={sp.vendorId ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Category</label>
            <select name="category" defaultValue={sp.category ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">From</label>
            <input type="date" name="from" defaultValue={sp.from} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">To</label>
            <input type="date" name="to" defaultValue={sp.to} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Min Amount</label>
            <input type="number" name="minAmount" defaultValue={sp.minAmount} placeholder="₹" className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-6">
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Apply Filters
            </button>
            <Link href="/bills" className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {bills.length === 0 ? (
          <EmptyState title="No bills match these filters" description="Try widening your date range or clearing filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Bill #</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Products</th>
                  <th className="pb-2 pr-3 text-right">Qty Items</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3">Payment</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const isHighValue = bill.grandTotal >= HIGH_VALUE_THRESHOLD && bill.type === "INVOICE";
                  const isUnpaid = bill.paymentStatus === "UNPAID" || bill.paymentStatus === "PARTIAL";
                  return (
                    <tr
                      key={bill.id}
                      className={`border-b border-border/60 last:border-0 hover:bg-surface-muted/60 ${
                        isHighValue ? "bg-warn-bg/40" : ""
                      } ${bill.type === "RETURN" ? "bg-crit-bg/30" : ""}`}
                    >
                      <td className="py-2.5 pr-3 font-medium">
                        <Link href={`/bills/${bill.id}`} className="hover:text-brand hover:underline">
                          {bill.billNumber}
                        </Link>
                        {bill.isUncertain && <span className="ml-1.5 text-warn" title="Some fields uncertain from extraction">*</span>}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(bill.date)}</td>
                      <td className="py-2.5 pr-3">{bill.vendor.name}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{CATEGORY_LABELS[bill.category]}</td>
                      <td className="py-2.5 pr-3 max-w-[220px] truncate text-muted">
                        {bill.lineItems.slice(0, 3).map((li) => li.productNameRaw).join(", ")}
                        {bill.lineItems.length > 3 ? ` +${bill.lineItems.length - 3} more` : ""}
                      </td>
                      <td className="py-2.5 pr-3 text-right">{bill.lineItems.length}</td>
                      <td className="py-2.5 pr-3 text-right font-medium whitespace-nowrap">
                        {bill.type === "RETURN" ? "−" : ""}
                        {formatINR(bill.grandTotal)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={bill.type === "RETURN" ? "crit" : isUnpaid ? "warn" : "ok"}>
                          {bill.type === "RETURN" ? "Return" : bill.paymentStatus === "UNKNOWN" ? "Paid (assumed)" : bill.paymentStatus}
                        </Badge>
                      </td>
                      <td className="py-2.5 max-w-[160px] truncate text-xs text-muted">{bill.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

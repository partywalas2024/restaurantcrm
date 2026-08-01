import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ExportButton } from "@/components/ExportButton";
import { StatCard } from "@/components/StatCard";
import { getVendors } from "@/lib/data";
import { getRestaurantProfile } from "@/lib/settings";
import { formatDate, formatINR } from "@/lib/format";
import { Truck, Receipt, Package, Clock, Plus, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const [vendors, profile] = await Promise.all([getVendors(), getRestaurantProfile()]);
  const totalSpend = vendors.reduce((s, v) => s + v.totalAmount, 0);
  const totalPending = vendors.reduce((s, v) => s + v.pendingAmount, 0);

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        description={`Every supplier that's billed ${profile.name}, ranked by total business`}
        actions={
          <>
            <ExportButton kind="vendors" />
            <Link
              href="/vendors/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              <Plus size={14} /> Add Vendor
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Vendors" value={vendors.length} icon={Truck} />
        <StatCard label="Total Purchases (all-time)" value={formatINR(totalSpend)} icon={Receipt} tone="info" />
        <StatCard label="Pending Payments" value={formatINR(totalPending)} icon={Clock} tone={totalPending > 0 ? "warn" : "ok"} />
      </div>

      {vendors.length === 1 && (
        <p className="mt-4 rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
          All bills in this dataset come from a single vendor, so vendor-wise rankings will trivially show 100% concentration until more suppliers are added.
        </p>
      )}

      <Card className="mt-6">
        {vendors.length === 0 ? (
          <EmptyState title="No vendors yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2 pr-3 text-right">Total Purchases</th>
                  <th className="pb-2 pr-3 text-right">Bills</th>
                  <th className="pb-2 pr-3 text-right">Items Supplied</th>
                  <th className="pb-2 pr-3 text-right">Pending</th>
                  <th className="pb-2 pr-3">Last Order</th>
                  <th className="pb-2">Statement</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v, i) => (
                  <tr key={v.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link href={`/vendors/${v.id}`} className="flex items-center gap-2 font-medium hover:text-brand hover:underline">
                        {i === 0 && <Badge tone="info">#1</Badge>}
                        {v.name}
                      </Link>
                      <span className="text-xs text-muted">{v.phone}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatINR(v.totalAmount)}</td>
                    <td className="py-2.5 pr-3 text-right">{v.totalBills}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className="inline-flex items-center gap-1"><Package size={12} className="text-muted" />{v.itemsSupplied}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {v.pendingAmount > 0.005 ? <Badge tone="warn">{formatINR(v.pendingAmount)}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{v.lastOrderDate ? formatDate(v.lastOrderDate) : "—"}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <a href={`/api/export/ledger?vendorId=${v.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                          <FileText size={12} /> CSV
                        </a>
                        <a href={`/api/export/excel?kind=ledger&vendorId=${v.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                          <FileText size={12} /> Excel
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

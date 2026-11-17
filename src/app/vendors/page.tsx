import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ExportButton } from "@/components/ExportButton";
import { StatCard } from "@/components/StatCard";
import { getVendors, type VendorFilters } from "@/lib/data";
import { getRestaurant } from "@/lib/settings";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { Truck, Receipt, Package, Clock, Plus, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

function vendorFiltersFromParams(sp: Record<string, string | undefined>): VendorFilters {
  const pending = sp.pending === "due" || sp.pending === "clear" ? sp.pending : undefined;
  return {
    search: sp.search || undefined,
    pending,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();
  const filters = vendorFiltersFromParams(sp);
  const [vendors, profile] = await Promise.all([
    getVendors(user.restaurantId, filters),
    getRestaurant(user.restaurantId),
  ]);
  const totalSpend = vendors.reduce((s, v) => s + v.totalAmount, 0);
  const totalPending = vendors.reduce((s, v) => s + v.pendingAmount, 0);
  const hasFilters = Boolean(filters.search || filters.pending || filters.from || filters.to);

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        description={`Every supplier that's billed ${profile.name}, ranked by total business`}
        actions={
          <>
            <ExportButton kind="vendors" searchParams={sp} />
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
        <StatCard
          label={hasFilters ? "Matching Vendors" : "Active Vendors"}
          value={vendors.length}
          icon={Truck}
        />
        <StatCard
          label={hasFilters ? "Purchases (filtered)" : "Total Purchases (all-time)"}
          value={formatINR(totalSpend)}
          icon={Receipt}
          tone="info"
        />
        <StatCard
          label="Pending Payments"
          value={formatINR(totalPending)}
          icon={Clock}
          tone={totalPending > 0 ? "warn" : "ok"}
        />
      </div>

      <Card className="mt-6 mb-5">
        <form method="GET" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted">Search</label>
            <input
              name="search"
              defaultValue={sp.search}
              placeholder="Name, phone, GSTIN…"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Pending</label>
            <select
              name="pending"
              defaultValue={sp.pending ?? ""}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            >
              <option value="">All vendors</option>
              <option value="due">Has pending</option>
              <option value="clear">No pending</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Last order from</label>
            <input
              type="date"
              name="from"
              defaultValue={sp.from}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Last order to</label>
            <input
              type="date"
              name="to"
              defaultValue={sp.to}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-6">
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Apply Filters
            </button>
            <Link
              href="/vendors"
              className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {vendors.length === 1 && !hasFilters && (
        <p className="mb-4 rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
          All bills in this dataset come from a single vendor, so vendor-wise rankings will trivially show 100% concentration until more suppliers are added.
        </p>
      )}

      <Card>
        {vendors.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No vendors match these filters" : "No vendors yet"}
            description={hasFilters ? "Try clearing search or widening the date range." : undefined}
          />
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

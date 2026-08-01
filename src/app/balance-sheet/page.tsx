import Link from "next/link";
import { Boxes, Landmark, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { ExportButton } from "@/components/ExportButton";
import { getBalanceSheet } from "@/lib/data";
import { getRestaurantProfile } from "@/lib/settings";
import { formatDate, formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage() {
  const [sheet, profile] = await Promise.all([getBalanceSheet(), getRestaurantProfile()]);
  const today = formatDate(new Date());

  return (
    <div>
      <PageHeader
        title="Balance Sheet"
        description={`Simplified snapshot as of ${today} — assets and liabilities ${profile.name} actually tracks`}
        actions={<ExportButton kind="balance-sheet" />}
      />

      <p className="mb-6 rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
        This is a simplified operational balance sheet, not a full accountant&apos;s statement — it doesn&apos;t include cash/bank
        balances, fixed assets, or equity, since this app doesn&apos;t track those. It reflects only what it can see: inventory value
        on the assets side, and unpaid vendor bills (accounts payable) on the liabilities side.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Assets (Inventory)" value={formatINR(sheet.totalAssets)} icon={Boxes} tone="info" />
        <StatCard label="Total Liabilities (Payable)" value={formatINR(sheet.totalLiabilities)} icon={Landmark} tone={sheet.totalLiabilities > 0 ? "warn" : "ok"} />
        <StatCard
          label="Net Position"
          value={formatINR(sheet.netPosition)}
          icon={Scale}
          tone={sheet.netPosition >= 0 ? "ok" : "crit"}
          sublabel="Assets − Liabilities"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Assets">
          <div className="flex items-center justify-between border-b border-border py-2.5">
            <span className="text-sm">Inventory (current stock, at last purchase cost)</span>
            <span className="text-sm font-medium">{formatINR(sheet.stockValue)}</span>
          </div>
          <div className="flex items-center justify-between pt-3 text-sm font-semibold">
            <span>Total Assets</span>
            <span>{formatINR(sheet.totalAssets)}</span>
          </div>
        </Card>

        <Card title="Liabilities — Accounts Payable">
          {sheet.accountsPayable.length === 0 ? (
            <EmptyState title="Nothing owed" description="No vendor has an outstanding balance right now." />
          ) : (
            <>
              <div className="divide-y divide-border">
                {sheet.accountsPayable.map((v) => (
                  <div key={v.vendorId} className="flex items-center justify-between py-2.5 text-sm">
                    <Link href={`/vendors/${v.vendorId}`} className="hover:text-brand hover:underline">
                      {v.vendorName}
                    </Link>
                    <Badge tone="warn">{formatINR(v.balance)}</Badge>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 text-sm font-semibold">
                <span>Total Liabilities</span>
                <span>{formatINR(sheet.totalLiabilities)}</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Contact, Users, CalendarCheck, Plus, Search, Phone, Repeat, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { getCustomers, getGuestStats, getGuestInsights, SEGMENT_TONE, SEGMENT_DESCRIPTION } from "@/lib/customers";
import { requireRestaurantUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireRestaurantUser();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;

  const [guests, stats, insights] = await Promise.all([
    getCustomers(user.restaurantId, q),
    getGuestStats(user.restaurantId),
    getGuestInsights(user.restaurantId),
  ]);
  const { newVsReturning, segments } = insights;

  return (
    <div>
      <PageHeader
        title="Guests"
        description="Guest profiles, visit history, and segmentation — logged by your team, not auto-captured from every order yet"
        actions={
          <Link href="/guests/new" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
            <Plus size={14} /> Add Guest
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Guests" value={stats.totalGuests} icon={Contact} />
        <StatCard label="Visits Logged This Month" value={stats.visitsThisMonth} icon={CalendarCheck} tone="info" />
        <StatCard label="New Guests" value={newVsReturning.newCount} icon={Sparkles} tone="info" sublabel={formatINR(newVsReturning.newRevenue)} />
        <StatCard
          label="Returning Guests"
          value={newVsReturning.returningCount}
          icon={Repeat}
          tone="ok"
          sublabel={newVsReturning.returningRevenuePct !== null ? `${newVsReturning.returningRevenuePct.toFixed(0)}% of logged revenue` : formatINR(newVsReturning.returningRevenue)}
        />
      </div>

      {insights.guestsWithVisits > 0 && (
        <Card title="Segments" className="mt-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {segments.map(({ segment, count }) => (
              <div key={segment} className="rounded-lg border border-border px-3 py-2.5" title={SEGMENT_DESCRIPTION[segment]}>
                <Badge tone={SEGMENT_TONE[segment]}>{segment}</Badge>
                <p className="mt-1.5 text-lg font-semibold">{count}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Based on Recency, Frequency and Monetary rank among your own logged guests — meaningful relative to each other, not against a fixed scale.
          </p>
        </Card>
      )}

      <form className="mt-6 flex items-center gap-2" action="/guests">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or phone…"
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
          Search
        </button>
      </form>

      <Card className="mt-4">
        {guests.length === 0 ? (
          <EmptyState
            title={q ? "No guests match that search" : "No guests yet"}
            description={q ? undefined : "Add a guest and log their visits to start building real guest data."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Guest</th>
                  <th className="pb-2 pr-3">Contact</th>
                  <th className="pb-2 pr-3">Segment</th>
                  <th className="pb-2 pr-3 text-right">Visits</th>
                  <th className="pb-2 pr-3 text-right">Total Spend</th>
                  <th className="pb-2 pr-3 text-right">Avg / Visit</th>
                  <th className="pb-2">Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/guests/${g.id}`} className="font-medium hover:text-brand hover:underline">
                          {g.name}
                        </Link>
                        {g.whatsappOptIn && <Badge tone="ok">WhatsApp</Badge>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">
                      <span className="inline-flex items-center gap-1"><Phone size={12} />{g.phone}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {g.visitCount > 0 ? (
                        <Badge tone={SEGMENT_TONE[g.segment]}>{g.segment}</Badge>
                      ) : (
                        <span className="text-xs text-muted">no visits yet</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className="inline-flex items-center gap-1"><Users size={12} className="text-muted" />{g.visitCount}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatINR(g.totalSpend)}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{g.avgSpend !== null ? formatINR(g.avgSpend, { decimals: true }) : "—"}</td>
                    <td className="py-2.5 whitespace-nowrap text-muted">{g.lastVisit ? formatDate(g.lastVisit) : "—"}</td>
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

// Admin-only audit trail — who changed what, when. Read-only: nothing here
// is editable, since an activity log that could be edited wouldn't be one.

import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTION_TONE = {
  CREATE: "ok",
  UPDATE: "info",
  DELETE: "crit",
  IMPORT: "warn",
} as const;

const PAGE_SIZE = 100;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const [entries, entities] = await Promise.all([
    prisma.activityLog.findMany({
      where: params.entity ? { entity: params.entity } : undefined,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.activityLog.findMany({
      select: { entity: true },
      distinct: ["entity"],
      orderBy: { entity: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Every create, update, delete and import across the app, newest first. Visible to admins only."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/activity"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!params.entity ? "bg-brand text-white" : "bg-surface-muted text-muted hover:text-foreground"}`}
        >
          All
        </a>
        {entities.map((e) => (
          <a
            key={e.entity}
            href={`/activity?entity=${encodeURIComponent(e.entity)}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${params.entity === e.entity ? "bg-brand text-white" : "bg-surface-muted text-muted hover:text-foreground"}`}
          >
            {e.entity}
          </a>
        ))}
      </div>

      <Card>
        {entries.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
                <Badge tone={ACTION_TONE[e.action as keyof typeof ACTION_TONE] ?? "neutral"}>{e.action}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{e.summary}</p>
                  <p className="text-xs text-muted">{e.userName} · {formatDate(e.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {entries.length === PAGE_SIZE && (
          <p className="mt-3 text-center text-xs text-muted">Showing the most recent {PAGE_SIZE} entries.</p>
        )}
      </Card>
    </div>
  );
}

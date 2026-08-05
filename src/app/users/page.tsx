import Link from "next/link";
import { UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Users & Access"
        description="Everyone who can sign in to this CRM. There is no public sign-up — accounts are created here."
        actions={
          <Link
            href="/users/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            <UserPlus size={15} /> Add User
          </Link>
        }
      />

      {params.error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {params.error}
        </p>
      )}
      {params.created && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          User &ldquo;{params.created}&rdquo; created. Share their password securely — they can change it from Settings.
        </p>
      )}
      {params.deleted && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          User &ldquo;{params.deleted}&rdquo; deleted.
        </p>
      )}

      <Card>
        {users.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Last Sign-in</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5">
                      <p className="font-medium">
                        {u.name}
                        {u.id === admin.id && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                      </p>
                      <p className="text-xs text-muted">@{u.username}{u.email ? ` · ${u.email}` : ""}</p>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={u.role === "ADMIN" ? "info" : "neutral"}>
                        {u.role === "ADMIN" ? "Admin" : "User"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={u.isActive ? "ok" : "crit"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                    </td>
                    <td className="py-2.5 text-xs text-muted">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                    </td>
                    <td className="py-2.5 text-xs text-muted">{formatDate(u.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/users/${u.id}`} className="text-xs font-medium text-brand hover:underline">
                        Manage →
                      </Link>
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

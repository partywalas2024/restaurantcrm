import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EditUserForm, ResetPasswordForm } from "@/components/UserForms";
import { requireRestaurantAdmin } from "@/lib/auth";
import { deleteUserAction } from "@/lib/auth-actions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ManageUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireRestaurantAdmin();
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, restaurantId: admin.restaurantId },
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
  if (!user) notFound();

  const isSelf = user.id === admin.id;

  return (
    <div>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to users
      </Link>
      <PageHeader
        title={user.name}
        description={`@${user.username} · created ${formatDate(user.createdAt)} · ${
          user.lastLoginAt ? `last signed in ${formatDate(user.lastLoginAt)}` : "never signed in"
        }`}
        actions={
          <>
            <Badge tone={user.role === "RESTAURANT_ADMIN" ? "info" : "neutral"}>
              {user.role === "RESTAURANT_ADMIN" ? "Admin" : "User"}
            </Badge>
            <Badge tone={user.isActive ? "ok" : "crit"}>{user.isActive ? "Active" : "Disabled"}</Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Details">
          <EditUserForm user={user} />
        </Card>

        <div className="space-y-4">
          <Card title="Reset Password">
            <p className="mb-4 text-xs text-muted">
              Sets a new password immediately. {isSelf ? "You" : `@${user.username}`} will need it on the next sign-in.
            </p>
            <ResetPasswordForm userId={user.id} />
          </Card>

          <Card title="Danger Zone">
            {isSelf ? (
              <p className="text-xs text-muted">You cannot delete your own account.</p>
            ) : (
              <form action={deleteUserAction}>
                <input type="hidden" name="id" value={user.id} />
                <p className="mb-3 text-xs text-muted">
                  Permanently removes this sign-in. Business data (bills, sales, payments) is unaffected.
                  To keep the account but block access, uncheck &ldquo;Active&rdquo; instead.
                </p>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-crit/40 bg-crit-bg px-4 py-2 text-sm font-medium text-crit hover:bg-crit hover:text-white"
                >
                  <Trash2 size={15} /> Delete @{user.username}
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

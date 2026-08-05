import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { NewUserForm } from "@/components/UserForms";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <div>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to users
      </Link>
      <PageHeader
        title="Add User"
        description="Create a sign-in for someone on your team. You set their first password and hand it to them directly."
      />
      <Card className="max-w-lg">
        <NewUserForm />
      </Card>
    </div>
  );
}

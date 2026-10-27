import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatementImport } from "@/components/StatementImport";
import { CATEGORY_LABELS } from "@/lib/categories";

export default function ImportStatementPage() {
  return (
    <div>
      <Link href="/expenses/cash" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to expenses
      </Link>
      <PageHeader
        title="Import Bank / UPI Statement"
        description="Upload a statement, then tick the payments that are real expenses, tag each one and say what it was for. Nothing is saved until you confirm."
      />
      <StatementImport categoryOptions={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ManualBillForm } from "@/components/ManualBillForm";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  await requireUser();
  const vendors = await prisma.vendor.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link href="/bills" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to bills
      </Link>
      <PageHeader
        title="Add Bill Manually"
        description="Enter a bill by hand. It is stored exactly like an uploaded one — stock, expenses and the vendor ledger all update."
      />
      <Card>
        <ManualBillForm vendors={vendors} />
      </Card>
    </div>
  );
}

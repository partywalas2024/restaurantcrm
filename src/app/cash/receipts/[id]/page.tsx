import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { CashReceiptForm } from "@/components/CashReceiptForm";
import { getCashReceiptById, RECEIPT_KIND_LABEL } from "@/lib/cashbook";
import { requireRestaurantAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditCashReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantAdmin();
  const r = await getCashReceiptById(user.restaurantId, id);
  if (!r) notFound();

  return (
    <div>
      <Link href="/cash" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to cash book
      </Link>
      <PageHeader title="Edit Cash Received" description={`Entered by ${r.createdByName}`} />
      <Card className="max-w-lg">
        <CashReceiptForm
          kindOptions={Object.entries(RECEIPT_KIND_LABEL).map(([value, label]) => ({ value, label }))}
          receipt={{
            id: r.id,
            date: r.date.toISOString().slice(0, 10),
            amount: r.amount,
            kind: r.kind,
            receivedFrom: r.receivedFrom,
            description: r.description,
            explanation: r.explanation,
            reference: r.reference,
          }}
        />
      </Card>
    </div>
  );
}

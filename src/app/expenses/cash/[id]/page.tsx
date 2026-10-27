import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ExpenseForm } from "@/components/ExpenseForm";
import { getExpenseById } from "@/lib/expenses";
import { requireRestaurantAdmin } from "@/lib/auth";
import { CATEGORY_LABELS } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRestaurantAdmin();
  const expense = await getExpenseById(user.restaurantId, id);
  if (!expense) notFound();

  return (
    <div>
      <Link href="/expenses/cash" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to expenses
      </Link>
      <PageHeader title="Edit Expense" description={`Entered by ${expense.createdByName}${expense.source === "STATEMENT" ? " from a statement import" : ""}`} />
      <Card className="max-w-lg">
        <ExpenseForm
          categoryOptions={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          expense={{
            id: expense.id,
            date: expense.date.toISOString().slice(0, 10),
            amount: expense.amount,
            category: expense.category,
            paymentMethod: expense.paymentMethod,
            paidTo: expense.paidTo,
            description: expense.description,
            explanation: expense.explanation,
            reference: expense.reference,
          }}
        />
      </Card>
    </div>
  );
}

import Link from "next/link";
import { Banknote, Wallet, Landmark, Tag, FileUp, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthSelect } from "@/components/MonthSelect";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ExpenseForm } from "@/components/ExpenseForm";
import { getExpenseMonths, getExpensesForMonth, getStatementImports } from "@/lib/expenses";
import { deleteExpense, deleteStatementImport } from "@/lib/expense-actions";
import { requireRestaurantUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDate, formatINR, formatMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank", CHEQUE: "Cheque", OTHER: "Other" };

export default async function CashExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRestaurantUser();
  const owner = isOwner(user.role);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = await getExpenseMonths(user.restaurantId);
  const monthList = months.includes(thisMonth) ? months : [thisMonth, ...months];
  const month = params.month && monthList.includes(params.month) ? params.month : monthList[0];

  const [data, imports] = await Promise.all([
    getExpensesForMonth(user.restaurantId, month),
    owner ? getStatementImports(user.restaurantId) : Promise.resolve([]),
  ]);
  const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div>
      <PageHeader
        title="Cash & Other Expenses"
        description={`${formatMonth(`${month}-01`)} — money paid out that isn't a vendor bill, each with what it was for and why`}
        actions={
          <>
            <MonthSelect months={monthList} value={month} />
            {owner && (
              <Link href="/expenses/cash/import" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
                <FileUp size={14} /> Import Statement
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total This Month" value={formatINR(data.total)} icon={Wallet} />
        <StatCard label="Paid in Cash" value={formatINR(data.cash)} icon={Banknote} tone="info" />
        <StatCard label="Counts as Operating Expense" value={formatINR(data.operating)} icon={Landmark} tone="warn" sublabel="flows into the P&L" />
        <StatCard
          label="Biggest Category"
          value={data.topCategory ? CATEGORY_LABELS[data.topCategory.category] : "—"}
          icon={Tag}
          tone="info"
          sublabel={data.topCategory ? formatINR(data.topCategory.amount) : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Entries" className="lg:col-span-2">
          {data.rows.length === 0 ? (
            <EmptyState title="No expenses this month" description="Add one with the form — a clear description makes it useful when someone checks the books later." />
          ) : (
            <div className="divide-y divide-border">
              {data.rows.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{e.description}</p>
                    {e.explanation && <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{e.explanation}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{formatDate(e.date)}</span>
                      <Badge tone="neutral">{CATEGORY_LABELS[e.category]}</Badge>
                      <span>{METHOD_LABEL[e.paymentMethod]}</span>
                      {e.paidTo && <span>to {e.paidTo}</span>}
                      {e.reference && <span>ref {e.reference}</span>}
                      {e.source === "STATEMENT" && <Badge tone="info">From statement</Badge>}
                      <span>entered by {e.createdByName}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-medium">{formatINR(e.amount, { decimals: true })}</span>
                    {owner && (
                      <div className="flex items-center gap-3 text-xs font-medium">
                        <Link href={`/expenses/cash/${e.id}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                          <Pencil size={11} /> Edit
                        </Link>
                        <form action={deleteExpense}>
                          <input type="hidden" name="id" value={e.id} />
                          <ConfirmButton message={`Delete "${e.description}" (${formatINR(e.amount)})?`} className="text-crit hover:underline">Delete</ConfirmButton>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Add Expense">
            <ExpenseForm categoryOptions={categoryOptions} />
          </Card>

          {owner && imports.length > 0 && (
            <Card title="Statement Imports">
              <div className="divide-y divide-border">
                {imports.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.fileName}</p>
                      <p className="text-xs text-muted">
                        {s.transactionCount} entries · {formatINR(s.totalAmount)} · by {s.importedByName} on {formatDate(s.createdAt)}
                      </p>
                    </div>
                    <form action={deleteStatementImport}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmButton message={`Undo the import of "${s.fileName}"? All ${s.transactionCount} expenses it created are deleted.`} className="text-xs text-crit hover:underline">
                        Undo
                      </ConfirmButton>
                    </form>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

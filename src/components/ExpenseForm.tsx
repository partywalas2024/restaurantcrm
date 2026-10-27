"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createExpense, updateExpense, type ExpenseFormState } from "@/lib/expense-actions";

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export type ExpenseFormValues = {
  id: string;
  date: string;
  amount: number;
  category: string;
  paymentMethod: string;
  paidTo: string | null;
  description: string;
  explanation: string | null;
  reference: string | null;
};

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

export function ExpenseForm({
  categoryOptions,
  expense,
}: {
  categoryOptions: { value: string; label: string }[];
  expense?: ExpenseFormValues;
}) {
  const editing = Boolean(expense);
  const [state, formAction, pending] = useActionState<ExpenseFormState, FormData>(editing ? updateExpense : createExpense, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    // Remounting on each successful save clears the fields ready for the next entry.
    <form key={state.n ?? 0} action={formAction} className="space-y-3">
      {expense && <input type="hidden" name="id" value={expense.id} />}
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {state.success}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="exp-date">Date *</label>
          <input id="exp-date" name="date" type="date" required defaultValue={expense?.date ?? today} className={INPUT} />
        </div>
        <div>
          <label className={LABEL} htmlFor="exp-amount">Amount (₹) *</label>
          <input id="exp-amount" name="amount" type="number" step="any" min="0.01" required defaultValue={expense?.amount} className={INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="exp-category">Category *</label>
          <select id="exp-category" name="category" required defaultValue={expense?.category ?? "OTHER"} className={INPUT}>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="exp-method">Paid by *</label>
          <select id="exp-method" name="paymentMethod" defaultValue={expense?.paymentMethod ?? "CASH"} className={INPUT}>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="exp-desc">What was it for? *</label>
        <input id="exp-desc" name="description" required minLength={3} maxLength={200} defaultValue={expense?.description} placeholder="e.g. Plumber — kitchen drain repair" className={INPUT} />
      </div>

      <div>
        <label className={LABEL} htmlFor="exp-paidto">Paid to</label>
        <input id="exp-paidto" name="paidTo" defaultValue={expense?.paidTo ?? ""} placeholder="Person or shop, e.g. Raju Plumber" className={INPUT} />
      </div>

      <div>
        <label className={LABEL} htmlFor="exp-expl">Explanation (for reference)</label>
        <textarea
          id="exp-expl"
          name="explanation"
          rows={3}
          maxLength={1000}
          defaultValue={expense?.explanation ?? ""}
          placeholder="Why was this needed, who approved it, anything someone checking later should know"
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="exp-ref">Receipt / reference no.</label>
        <input id="exp-ref" name="reference" defaultValue={expense?.reference ?? ""} placeholder="Optional" className={INPUT} />
      </div>

      <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
        {pending ? "Saving…" : editing ? "Save Changes" : "Add Expense"}
      </button>
    </form>
  );
}

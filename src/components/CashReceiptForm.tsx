"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createCashReceipt, updateCashReceipt, type CashReceiptState } from "@/lib/cash-actions";

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export type CashReceiptValues = {
  id: string;
  date: string;
  amount: number;
  kind: string;
  receivedFrom: string | null;
  description: string;
  explanation: string | null;
  reference: string | null;
};

export function CashReceiptForm({ kindOptions, receipt }: { kindOptions: { value: string; label: string }[]; receipt?: CashReceiptValues }) {
  const editing = Boolean(receipt);
  const [state, formAction, pending] = useActionState<CashReceiptState, FormData>(editing ? updateCashReceipt : createCashReceipt, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form key={state.n ?? 0} action={formAction} className="space-y-3">
      {receipt && <input type="hidden" name="id" value={receipt.id} />}
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
          <label className={LABEL} htmlFor="cr-date">Date *</label>
          <input id="cr-date" name="date" type="date" required defaultValue={receipt?.date ?? today} className={INPUT} />
        </div>
        <div>
          <label className={LABEL} htmlFor="cr-amount">Amount (₹) *</label>
          <input id="cr-amount" name="amount" type="number" step="any" min="0.01" required defaultValue={receipt?.amount} className={INPUT} />
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="cr-kind">Kind of cash *</label>
        <select id="cr-kind" name="kind" defaultValue={receipt?.kind ?? "OTHER"} className={INPUT}>
          {kindOptions.map((k) => (<option key={k.value} value={k.value}>{k.label}</option>))}
        </select>
      </div>
      <div>
        <label className={LABEL} htmlFor="cr-desc">What was it for? *</label>
        <input id="cr-desc" name="description" required minLength={3} maxLength={200} defaultValue={receipt?.description} placeholder="e.g. Advance for Sharma birthday party, 24 Nov" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="cr-from">Received from</label>
        <input id="cr-from" name="receivedFrom" defaultValue={receipt?.receivedFrom ?? ""} placeholder="Person or company" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="cr-expl">Explanation (for reference)</label>
        <textarea id="cr-expl" name="explanation" rows={2} maxLength={1000} defaultValue={receipt?.explanation ?? ""} placeholder="Terms, balance still due, who took the cash" className={INPUT} />
      </div>
      <div>
        <label className={LABEL} htmlFor="cr-ref">Receipt / reference no.</label>
        <input id="cr-ref" name="reference" defaultValue={receipt?.reference ?? ""} placeholder="Optional" className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
        {pending ? "Saving…" : editing ? "Save Changes" : "Add Cash Received"}
      </button>
    </form>
  );
}

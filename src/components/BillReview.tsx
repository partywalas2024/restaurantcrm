"use client";

// The review step of the upload flow. Everything the model read is editable
// here, because extraction is fallible and the person holding the paper bill is
// the authority. Warnings recompute on every keystroke using the same
// `checkBill` rules the server ran, so a correction visibly clears the flag.

import { useMemo, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Plus, ShieldCheck, Trash2, Wand2,
} from "lucide-react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { checkBill } from "@/lib/bill-check";
import { formatINR } from "@/lib/format";

export type ReviewItem = { name: string; unit: string; hsn?: string; qty: number; rate: number; amount: number };
export type ReviewBill = {
  billNumber: string; billNumberUncertain?: boolean; type: string; date: string; dueDate?: string;
  subtotal: number; sgst: number; cgst: number; roundoff: number; grandTotal: number;
  notes?: string; items: ReviewItem[]; warnings?: string[];
};
export type ReviewResult = {
  vendor: { name: string; phone?: string; address?: string; gstin?: string };
  bills: ReviewBill[];
};

const INPUT = "w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm";
const NUM = INPUT + " text-right tabular-nums";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export function BillReview({
  result, onChange, onApprove, onDiscard, saving,
}: {
  result: ReviewResult;
  onChange: (r: ReviewResult) => void;
  onApprove: () => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    const o: Record<number, boolean> = {};
    result.bills.forEach((b, i) => { if (b.warnings?.length) o[i] = true; });
    return o;
  });
  const [acknowledged, setAcknowledged] = useState(false);

  // Recomputed live rather than read from the server's response, so edits take effect immediately.
  const warningsByBill = useMemo(() => result.bills.map((b) => checkBill(b)), [result]);
  const flaggedCount = warningsByBill.filter((w) => w.length > 0).length;
  const netTotal = result.bills.reduce((s, b) => s + (b.type === "RETURN" ? -b.grandTotal : b.grandTotal), 0);

  const setVendor = (patch: Partial<ReviewResult["vendor"]>) =>
    onChange({ ...result, vendor: { ...result.vendor, ...patch } });

  const setBill = (i: number, patch: Partial<ReviewBill>) =>
    onChange({ ...result, bills: result.bills.map((b, k) => (k === i ? { ...b, ...patch } : b)) });

  const setItem = (bi: number, ii: number, patch: Partial<ReviewItem>) =>
    onChange({
      ...result,
      bills: result.bills.map((b, k) =>
        k !== bi ? b : { ...b, items: b.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) },
      ),
    });

  const addItem = (bi: number) =>
    setBill(bi, { items: [...result.bills[bi].items, { name: "", unit: "PCS", qty: 0, rate: 0, amount: 0 }] });

  const removeItem = (bi: number, ii: number) =>
    setBill(bi, { items: result.bills[bi].items.filter((_, j) => j !== ii) });

  /** Adopt the figures the line items actually produce — the usual fix when a total was misread. */
  const recalc = (bi: number) => {
    const b = result.bills[bi];
    const subtotal = Math.round(b.items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    setBill(bi, { subtotal, grandTotal: Math.round((subtotal + b.sgst + b.cgst + b.roundoff) * 100) / 100 });
  };

  return (
    <>
      <Card title="Vendor" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={LABEL}>Name *</label><input value={result.vendor.name} onChange={(e) => setVendor({ name: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>GSTIN</label><input value={result.vendor.gstin ?? ""} onChange={(e) => setVendor({ gstin: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Phone</label><input value={result.vendor.phone ?? ""} onChange={(e) => setVendor({ phone: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Address</label><input value={result.vendor.address ?? ""} onChange={(e) => setVendor({ address: e.target.value })} className={INPUT} /></div>
        </div>
        <p className="mt-2 text-xs text-muted">An existing supplier is matched by name regardless of capitalisation — no duplicate account is created.</p>
      </Card>

      {flaggedCount > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><strong>{flaggedCount} of {result.bills.length} bill(s) don&apos;t add up.</strong> Correct any figure below against the paper bill — the warnings clear as you fix them.</span>
        </p>
      ) : (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2.5 text-sm text-ok">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>All {result.bills.length} bill(s) reconcile — line items match each subtotal, and subtotals plus tax match each grand total.</span>
        </p>
      )}

      <Card title={`${result.bills.length} bill(s) — net ${formatINR(netTotal)}`}>
        <div className="divide-y divide-border">
          {result.bills.map((b, bi) => {
            const warns = warningsByBill[bi];
            const itemsSum = b.items.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={bi} className="py-2">
                <button onClick={() => setOpen((o) => ({ ...o, [bi]: !o[bi] }))} className="flex w-full items-center gap-2 text-left">
                  {open[bi] ? <ChevronDown size={15} className="shrink-0 text-muted" /> : <ChevronRight size={15} className="shrink-0 text-muted" />}
                  <span className="font-medium">{b.billNumber || "(no number)"}</span>
                  <span className="text-xs text-muted">{b.date}</span>
                  {b.type === "RETURN" && <Badge tone="crit">Return</Badge>}
                  {warns.length > 0 ? <Badge tone="warn">{warns.length} issue{warns.length > 1 ? "s" : ""}</Badge> : <Badge tone="ok">OK</Badge>}
                  <span className="ml-auto shrink-0 text-sm font-medium">{formatINR(b.grandTotal)}</span>
                </button>

                {open[bi] && (
                  <div className="mt-3 space-y-4 pl-6">
                    {warns.length > 0 && (
                      <ul className="space-y-1 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                        {warns.map((w, k) => <li key={k} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</li>)}
                      </ul>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div><label className={LABEL}>Bill Number</label><input value={b.billNumber} onChange={(e) => setBill(bi, { billNumber: e.target.value, billNumberUncertain: false })} className={INPUT} /></div>
                      <div>
                        <label className={LABEL}>Type</label>
                        <select value={b.type} onChange={(e) => setBill(bi, { type: e.target.value })} className={INPUT}>
                          <option value="INVOICE">Invoice</option>
                          <option value="RETURN">Return</option>
                        </select>
                      </div>
                      <div><label className={LABEL}>Bill Date</label><input type="date" value={b.date} onChange={(e) => setBill(bi, { date: e.target.value })} className={INPUT} /></div>
                      <div><label className={LABEL}>Due Date</label><input type="date" value={b.dueDate ?? ""} onChange={(e) => setBill(bi, { dueDate: e.target.value })} className={INPUT} /></div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted uppercase">Line items</p>
                        <button type="button" onClick={() => addItem(bi)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs font-medium hover:bg-surface-muted">
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[42rem] text-xs">
                          <thead>
                            <tr className="border-b border-border text-left text-muted">
                              <th className="pb-1.5 font-medium">Item</th>
                              <th className="pb-1.5 font-medium">Unit</th>
                              <th className="pb-1.5 font-medium">HSN</th>
                              <th className="pb-1.5 font-medium">Qty</th>
                              <th className="pb-1.5 font-medium">Rate</th>
                              <th className="pb-1.5 font-medium">Amount</th>
                              <th className="pb-1.5" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {b.items.map((it, ii) => {
                              const expected = it.qty * it.rate;
                              const rowOff = Math.abs(expected - it.amount) > 1;
                              return (
                                <tr key={ii} className={rowOff ? "bg-warn-bg/40" : undefined}>
                                  <td className="py-1 pr-1"><input value={it.name} onChange={(e) => setItem(bi, ii, { name: e.target.value })} className={INPUT} /></td>
                                  <td className="py-1 pr-1 w-20"><input value={it.unit} onChange={(e) => setItem(bi, ii, { unit: e.target.value })} className={INPUT} /></td>
                                  <td className="py-1 pr-1 w-20"><input value={it.hsn ?? ""} onChange={(e) => setItem(bi, ii, { hsn: e.target.value })} className={INPUT} /></td>
                                  <td className="py-1 pr-1 w-20"><input type="number" step="any" value={it.qty} onChange={(e) => setItem(bi, ii, { qty: Number(e.target.value) || 0 })} className={NUM} /></td>
                                  <td className="py-1 pr-1 w-24"><input type="number" step="any" value={it.rate} onChange={(e) => setItem(bi, ii, { rate: Number(e.target.value) || 0 })} className={NUM} /></td>
                                  <td className="py-1 pr-1 w-28">
                                    <input type="number" step="any" value={it.amount} onChange={(e) => setItem(bi, ii, { amount: Number(e.target.value) || 0 })} className={NUM} />
                                    {rowOff && <button type="button" onClick={() => setItem(bi, ii, { amount: Math.round(expected * 100) / 100 })} className="mt-0.5 text-[11px] text-warn hover:underline">use {formatINR(expected, { decimals: true })}</button>}
                                  </td>
                                  <td className="py-1">
                                    <button type="button" onClick={() => removeItem(bi, ii)} className="rounded p-1 text-muted hover:bg-crit-bg hover:text-crit" aria-label="Remove item"><Trash2 size={13} /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-1.5 text-xs text-muted">Line items total {formatINR(itemsSum, { decimals: true })}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div><label className={LABEL}>Subtotal</label><input type="number" step="any" value={b.subtotal} onChange={(e) => setBill(bi, { subtotal: Number(e.target.value) || 0 })} className={NUM} /></div>
                      <div><label className={LABEL}>SGST</label><input type="number" step="any" value={b.sgst} onChange={(e) => setBill(bi, { sgst: Number(e.target.value) || 0 })} className={NUM} /></div>
                      <div><label className={LABEL}>CGST</label><input type="number" step="any" value={b.cgst} onChange={(e) => setBill(bi, { cgst: Number(e.target.value) || 0 })} className={NUM} /></div>
                      <div><label className={LABEL}>Round off</label><input type="number" step="any" value={b.roundoff} onChange={(e) => setBill(bi, { roundoff: Number(e.target.value) || 0 })} className={NUM} /></div>
                      <div><label className={LABEL}>Grand Total</label><input type="number" step="any" value={b.grandTotal} onChange={(e) => setBill(bi, { grandTotal: Number(e.target.value) || 0 })} className={NUM} /></div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => recalc(bi)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted">
                        <Wand2 size={13} /> Set totals from line items
                      </button>
                      <span className="text-xs text-muted">Use when the line items are right but a total was misread.</span>
                    </div>

                    <div><label className={LABEL}>Notes</label><input value={b.notes ?? ""} onChange={(e) => setBill(bi, { notes: e.target.value })} className={INPUT} /></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mt-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border" />
          <span>
            I&apos;ve checked these figures against the bills and they&apos;re correct.
            {flaggedCount > 0 && <span className="text-warn"> ({flaggedCount} bill(s) still flagged.)</span>}
          </span>
        </label>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button onClick={onApprove} disabled={!acknowledged || saving} className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Saving…" : `Approve & Save ${result.bills.length} Bill(s)`}
          </button>
          <button onClick={onDiscard} disabled={saving} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-50">
            Discard
          </button>
        </div>
      </Card>
    </>
  );
}

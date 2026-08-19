"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createManualBill } from "@/lib/actions";
import { formatINR } from "@/lib/format";

type Row = { id: number; name: string; unit: string; hsn: string; qty: string; rate: string };

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";

let nextId = 1;
const blankRow = (): Row => ({ id: nextId++, name: "", unit: "KG", hsn: "", qty: "", rate: "" });

export function ManualBillForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);
  const [sgst, setSgst] = useState("");
  const [cgst, setCgst] = useState("");
  const [roundoff, setRoundoff] = useState("");
  const [newVendor, setNewVendor] = useState(vendors.length === 0);

  const update = (id: number, field: keyof Row, value: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const subtotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);
  const grandTotal = subtotal + (Number(sgst) || 0) + (Number(cgst) || 0) + (Number(roundoff) || 0);

  return (
    <form action={createManualBill} className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Vendor</h2>
        {vendors.length > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={newVendor} onChange={(e) => setNewVendor(e.target.checked)} className="h-4 w-4 rounded border-border" />
            This is a new vendor
          </label>
        )}
        {newVendor ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={LABEL}>Vendor Name *</label><input name="vendorName" required className={INPUT} placeholder="e.g. Sharma Trading Co." /></div>
            <div><label className={LABEL}>Phone</label><input name="vendorPhone" className={INPUT} /></div>
            <div><label className={LABEL}>GSTIN</label><input name="vendorGstin" className={INPUT} /></div>
          </div>
        ) : (
          <div>
            <label className={LABEL}>Vendor *</label>
            <select name="vendorName" required className={INPUT} defaultValue={vendors[0]?.name}>
              {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Bill Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={LABEL}>Bill Number *</label><input name="billNumber" required className={INPUT} placeholder="e.g. A001402" /></div>
          <div>
            <label className={LABEL}>Type *</label>
            <select name="type" defaultValue="INVOICE" className={INPUT}>
              <option value="INVOICE">Invoice (purchase)</option>
              <option value="RETURN">Return / credit note</option>
            </select>
          </div>
          <div><label className={LABEL}>Bill Date *</label><input name="date" type="date" required className={INPUT} /></div>
          <div><label className={LABEL}>Due Date</label><input name="dueDate" type="date" className={INPUT} /></div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Line Items</h2>
          <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-muted">
            <Plus size={13} /> Add row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-medium">Item name</th>
                <th className="pb-2 font-medium">Unit</th>
                <th className="pb-2 font-medium">HSN</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const amount = (Number(r.qty) || 0) * (Number(r.rate) || 0);
                return (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-2"><input name="itemName" value={r.name} onChange={(e) => update(r.id, "name", e.target.value)} className={INPUT} placeholder="e.g. TOOR DAL" /></td>
                    <td className="py-1.5 pr-2 w-24"><input name="itemUnit" value={r.unit} onChange={(e) => update(r.id, "unit", e.target.value)} className={INPUT} /></td>
                    <td className="py-1.5 pr-2 w-24"><input name="itemHsn" value={r.hsn} onChange={(e) => update(r.id, "hsn", e.target.value)} className={INPUT} /></td>
                    <td className="py-1.5 pr-2 w-24"><input name="itemQty" type="number" step="any" value={r.qty} onChange={(e) => update(r.id, "qty", e.target.value)} className={INPUT} /></td>
                    <td className="py-1.5 pr-2 w-28"><input name="itemRate" type="number" step="any" value={r.rate} onChange={(e) => update(r.id, "rate", e.target.value)} className={INPUT} /></td>
                    <td className="py-1.5 pr-2 text-right text-sm tabular-nums">{amount > 0 ? formatINR(amount, { decimals: true }) : "—"}</td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))} className="rounded p-1 text-muted hover:bg-crit-bg hover:text-crit" aria-label="Remove row">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Blank rows are ignored. Amount is calculated as quantity × rate.</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Taxes &amp; Total</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={LABEL}>SGST</label><input name="sgst" type="number" step="any" value={sgst} onChange={(e) => setSgst(e.target.value)} className={INPUT} placeholder="0.00" /></div>
          <div><label className={LABEL}>CGST</label><input name="cgst" type="number" step="any" value={cgst} onChange={(e) => setCgst(e.target.value)} className={INPUT} placeholder="0.00" /></div>
          <div><label className={LABEL}>Round Off</label><input name="roundoff" type="number" step="any" value={roundoff} onChange={(e) => setRoundoff(e.target.value)} className={INPUT} placeholder="0.00" /></div>
        </div>

        <div className="mt-4 rounded-lg bg-surface-muted px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{formatINR(subtotal, { decimals: true })}</span></div>
          <div className="mt-1 flex justify-between font-semibold"><span>Grand Total</span><span className="tabular-nums">{formatINR(grandTotal, { decimals: true })}</span></div>
          <p className="mt-2 text-xs text-muted">Check this against the paper bill before saving.</p>
        </div>
      </section>

      <section>
        <label className={LABEL}>Notes</label>
        <textarea name="notes" rows={2} className={INPUT} placeholder="Anything worth recording — delivery details, disputes, handwritten remarks" />
      </section>

      <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark">
        Save Bill
      </button>
    </form>
  );
}

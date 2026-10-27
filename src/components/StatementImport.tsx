"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

type ParsedRow = {
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  category: string;
  duplicate: string | null;
  vendorMatch: string | null;
};
type Row = ParsedRow & { include: boolean; explanation: string };

const INPUT = "w-full rounded-md border border-border bg-surface px-2 py-1 text-sm";
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function StatementImport({ categoryOptions }: { categoryOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "review" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ fileName: string; source: string; creditsSkipped: number } | null>(null);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [saved, setSaved] = useState<{ imported: number; total: number; month: string } | null>(null);

  const selected = useMemo(() => rows.filter((r) => r.include), [rows]);
  const selectedTotal = selected.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const flagged = rows.filter((r) => r.duplicate || r.vendorMatch).length;

  function patch(i: number, change: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }

  async function read() {
    if (!file) return;
    setStatus("reading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/statement/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that statement.");
        setStatus("idle");
        return;
      }
      setRows((data.rows as ParsedRow[]).map((r) => ({ ...r, include: !r.duplicate && !r.vendorMatch, explanation: "" })));
      setMeta({ fileName: data.fileName, source: data.source, creditsSkipped: data.creditsSkipped ?? 0 });
      setStatus("review");
    } catch {
      setError("Could not reach the server.");
      setStatus("idle");
    }
  }

  async function save() {
    setError(null);
    const bad = selected.find((r) => r.description.trim().length < 3);
    if (bad) {
      setError(`"${bad.date} · ${bad.amount}" needs a description of at least 3 characters.`);
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch("/api/statement/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: meta?.fileName,
          paymentMethod: method,
          rows: selected.map((r) => ({
            date: r.date,
            description: r.description,
            amount: Number(r.amount),
            category: r.category,
            explanation: r.explanation,
            reference: r.reference,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setStatus("review");
        return;
      }
      setSaved({ imported: data.imported, total: data.total, month: selected[0].date.slice(0, 7) });
      setStatus("done");
      router.refresh();
    } catch {
      setError("Import failed.");
      setStatus("review");
    }
  }

  if (status === "done" && saved) {
    return (
      <Card>
        <p className="mb-4 flex items-center gap-2 text-sm text-ok">
          <CheckCircle2 size={18} /> Imported {saved.imported} expense(s) totalling {inr(saved.total)}.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/expenses/cash?month=${saved.month}`} className="rounded-lg bg-brand px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-dark">View expenses</Link>
          <button onClick={() => { setFile(null); setRows([]); setSaved(null); setStatus("idle"); }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
            Import another statement
          </button>
        </div>
      </Card>
    );
  }

  if (status === "review" || status === "saving") {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              <strong>{rows.length}</strong> money-out transactions read from <strong>{meta?.fileName}</strong>
              {meta?.creditsSkipped ? ` (${meta.creditsSkipped} credits ignored)` : ""}. <strong>{selected.length}</strong> selected · {inr(selectedTotal)}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted" htmlFor="st-method">Paid by</label>
              <select id="st-method" value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-sm">
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Card / other</option>
              </select>
              <button onClick={() => setRows((p) => p.map((r) => ({ ...r, include: true })))} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted">All</button>
              <button onClick={() => setRows((p) => p.map((r) => ({ ...r, include: false })))} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted">None</button>
            </div>
          </div>
          {flagged > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {flagged} row(s) are unticked because they look like a vendor payment (already counted through the vendor&apos;s bill — record those as payments on the vendor page) or are already entered as an expense. Tick one if you&apos;re sure it&apos;s separate.
            </p>
          )}
          {meta?.source === "ai" && (
            <p className="mt-3 text-xs text-muted">Read from a PDF/photo — check dates and amounts against the original before saving.</p>
          )}
        </Card>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-2" />
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2">Explanation (why / who approved)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-border/60 align-top last:border-0 ${r.include ? "" : "opacity-60"}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} aria-label="Include this transaction" className="mt-1.5 rounded border-border" />
                    </td>
                    <td className="py-2 pr-3"><input type="date" value={r.date} onChange={(e) => patch(i, { date: e.target.value })} className={`${INPUT} w-36`} /></td>
                    <td className="py-2 pr-3">
                      <input value={r.description} onChange={(e) => patch(i, { description: e.target.value })} className={INPUT} />
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {r.vendorMatch && <Badge tone="warn">Looks like payment to {r.vendorMatch}</Badge>}
                        {r.duplicate && <Badge tone="crit">Already entered: {r.duplicate}</Badge>}
                        {r.reference && <span className="text-xs text-muted">ref {r.reference}</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-3"><input type="number" step="any" min="0" value={r.amount} onChange={(e) => patch(i, { amount: Number(e.target.value) })} className={`${INPUT} w-28 text-right`} /></td>
                    <td className="py-2 pr-3">
                      <select value={r.category} onChange={(e) => patch(i, { category: e.target.value })} className={INPUT}>
                        {categoryOptions.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                      </select>
                    </td>
                    <td className="py-2"><input value={r.explanation} onChange={(e) => patch(i, { explanation: e.target.value })} placeholder="Optional" className={INPUT} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={save}
            disabled={selected.length === 0 || status === "saving"}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {status === "saving" ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : `Import ${selected.length} expense(s) · ${inr(selectedTotal)}`}
          </button>
          <button onClick={() => { setRows([]); setStatus("idle"); }} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-muted">Discard</button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-14 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
      >
        <UploadCloud size={32} className="text-brand" />
        <p className="text-sm font-medium">Drag &amp; drop a statement here, or click to choose one</p>
        <p className="text-xs text-muted">CSV export from your bank (best), or a PDF / photo of the statement. Only money-out is imported.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv,application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={() => inputRef.current?.click()} className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">Choose File</button>
        {file && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium"><FileText size={14} /> {file.name}</p>}
      </div>
      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <button
        onClick={read}
        disabled={!file || status === "reading"}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {status === "reading" ? <><Loader2 size={16} className="animate-spin" /> Reading statement…</> : "Read Statement"}
      </button>
      {status === "reading" && <p className="mt-2 text-center text-xs text-muted">A long PDF can take a minute. Nothing is saved yet.</p>}
    </Card>
  );
}

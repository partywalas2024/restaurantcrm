"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, ChevronDown, ChevronRight, ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { formatINR } from "@/lib/format";

type Item = { name: string; unit: string; hsn?: string; qty: number; rate: number; amount: number };
type Bill = {
  billNumber: string; billNumberUncertain?: boolean; type: string; date: string; dueDate?: string;
  subtotal: number; sgst: number; cgst: number; roundoff: number; grandTotal: number;
  notes?: string; items: Item[]; warnings?: string[];
};
type Result = {
  vendor: { name: string; phone?: string; address?: string; gstin?: string };
  bills: Bill[];
};

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "extracting" | "review" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [summary, setSummary] = useState<{ billsCreated: number; lineItemsCreated: number } | null>(null);

  async function handleExtract() {
    if (!file) return;
    setStatus("extracting");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Extraction failed."); setStatus("error"); return; }
      setResult(data.result);
      // Open any bill with a problem so it can't be scrolled past unnoticed.
      const flagged: Record<number, boolean> = {};
      data.result.bills.forEach((b: Bill, i: number) => { if (b.warnings?.length) flagged[i] = true; });
      setOpen(flagged);
      setAcknowledged(false);
      setStatus("review");
    } catch {
      setError("Could not reach the extraction service.");
      setStatus("error");
    }
  }

  async function handleImport() {
    if (!result) return;
    setStatus("importing");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, fileName: file?.name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Import failed."); setStatus("error"); return; }
      setSummary(data);
      setStatus("done");
    } catch {
      setError("Import failed.");
      setStatus("error");
    }
  }

  function reset() {
    setFile(null); setResult(null); setError(null); setOpen({});
    setAcknowledged(false); setStatus("idle");
  }

  const flaggedCount = result?.bills.filter((b) => b.warnings?.length).length ?? 0;
  const netTotal = result?.bills.reduce((s, b) => s + (b.type === "RETURN" ? -b.grandTotal : b.grandTotal), 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Upload Bills"
        description="Upload a bills PDF or a photo of an invoice — every bill is read, checked and shown to you before anything is saved."
      />

      {(status === "idle" || status === "extracting" || status === "error") && (
        <Card>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-14 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          >
            <UploadCloud size={32} className="text-brand" />
            <p className="text-sm font-medium">Drag &amp; drop a file here, or click to choose one</p>
            <p className="text-xs text-muted">PDF (one or more bills, up to ~40 pages) or a photo — JPEG, PNG or WebP</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button onClick={() => inputRef.current?.click()} className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Choose File
            </button>
            {file && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <FileText size={14} /> {file.name}
              </p>
            )}
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          <button
            onClick={handleExtract}
            disabled={!file || status === "extracting"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {status === "extracting"
              ? <><Loader2 size={16} className="animate-spin" /> Reading bills…</>
              : "Read Bills"}
          </button>
          {status === "extracting" && (
            <p className="mt-2 text-center text-xs text-muted">A multi-page PDF can take a minute. Nothing is saved yet.</p>
          )}
        </Card>
      )}

      {status === "review" && result && (
        <>
          <Card title="Vendor" className="mb-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div><span className="text-muted">Name: </span><span className="font-medium">{result.vendor.name}</span></div>
              {result.vendor.gstin && <div><span className="text-muted">GSTIN: </span>{result.vendor.gstin}</div>}
              {result.vendor.phone && <div><span className="text-muted">Phone: </span>{result.vendor.phone}</div>}
              {result.vendor.address && <div><span className="text-muted">Address: </span>{result.vendor.address}</div>}
            </div>
          </Card>

          {flaggedCount > 0 ? (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>{flaggedCount} of {result.bills.length} bill(s) didn&apos;t add up.</strong> The figures below were read from the
                document, then re-checked against each other. Compare the flagged ones with the paper copy before approving — you can
                correct anything after saving.
              </span>
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2.5 text-sm text-ok">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <span>All {result.bills.length} bill(s) reconcile — line items match each subtotal, and subtotals plus tax match each grand total.</span>
            </p>
          )}

          <Card title={`${result.bills.length} bill(s) — net ${formatINR(netTotal)}`}>
            <div className="divide-y divide-border">
              {result.bills.map((b, i) => {
                const warn = b.warnings?.length ?? 0;
                const isOpen = open[i];
                return (
                  <div key={i} className="py-2">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      {isOpen ? <ChevronDown size={15} className="shrink-0 text-muted" /> : <ChevronRight size={15} className="shrink-0 text-muted" />}
                      <span className="font-medium">{b.billNumber}</span>
                      <span className="text-xs text-muted">{b.date}</span>
                      {b.type === "RETURN" && <Badge tone="crit">Return</Badge>}
                      {warn > 0 && <Badge tone="warn">{warn} issue{warn > 1 ? "s" : ""}</Badge>}
                      <span className="ml-auto shrink-0 text-sm font-medium">{formatINR(b.grandTotal)}</span>
                      <span className="hidden shrink-0 text-xs text-muted sm:inline">{b.items.length} items</span>
                    </button>

                    {isOpen && (
                      <div className="mt-3 pl-6">
                        {warn > 0 && (
                          <ul className="mb-3 space-y-1 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                            {b.warnings!.map((w, k) => (
                              <li key={k} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</li>
                            ))}
                          </ul>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[34rem] text-xs">
                            <thead>
                              <tr className="border-b border-border text-left text-muted">
                                <th className="pb-1.5 font-medium">Item</th>
                                <th className="pb-1.5 font-medium">HSN</th>
                                <th className="pb-1.5 text-right font-medium">Qty</th>
                                <th className="pb-1.5 text-right font-medium">Rate</th>
                                <th className="pb-1.5 text-right font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {b.items.map((it, k) => (
                                <tr key={k}>
                                  <td className="py-1.5">{it.name}</td>
                                  <td className="py-1.5 text-muted">{it.hsn ?? "—"}</td>
                                  <td className="py-1.5 text-right">{it.qty} {it.unit}</td>
                                  <td className="py-1.5 text-right">{formatINR(it.rate, { decimals: true })}</td>
                                  <td className="py-1.5 text-right">{formatINR(it.amount, { decimals: true })}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="text-xs">
                              <tr><td colSpan={4} className="pt-2 text-right text-muted">Subtotal</td><td className="pt-2 text-right">{formatINR(b.subtotal, { decimals: true })}</td></tr>
                              <tr><td colSpan={4} className="text-right text-muted">SGST</td><td className="text-right">{formatINR(b.sgst, { decimals: true })}</td></tr>
                              <tr><td colSpan={4} className="text-right text-muted">CGST</td><td className="text-right">{formatINR(b.cgst, { decimals: true })}</td></tr>
                              {b.roundoff !== 0 && <tr><td colSpan={4} className="text-right text-muted">Round off</td><td className="text-right">{formatINR(b.roundoff, { decimals: true })}</td></tr>}
                              <tr className="font-semibold"><td colSpan={4} className="text-right">Grand Total</td><td className="text-right">{formatINR(b.grandTotal, { decimals: true })}</td></tr>
                            </tfoot>
                          </table>
                        </div>

                        {b.notes && <p className="mt-2 text-xs text-muted">Note: {b.notes}</p>}
                        {b.dueDate && <p className="mt-1 text-xs text-muted">Due: {b.dueDate}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="mt-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
              />
              <span>
                I&apos;ve reviewed these figures against the bills and they&apos;re correct.
                {flaggedCount > 0 && <span className="text-warn"> ({flaggedCount} bill(s) still flagged.)</span>}
              </span>
            </label>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleImport}
                disabled={!acknowledged}
                className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Approve &amp; Save {result.bills.length} Bill(s)
              </button>
              <button onClick={reset} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-muted">
                Discard
              </button>
            </div>
          </Card>
        </>
      )}

      {status === "importing" && (
        <Card><p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Saving to database…</p></Card>
      )}

      {status === "done" && summary && (
        <Card>
          <p className="mb-4 flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 size={18} /> Saved {summary.billsCreated} bill(s) and {summary.lineItemsCreated} line items.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => router.push("/bills")} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              View Bills
            </button>
            <button onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
              Upload Another
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

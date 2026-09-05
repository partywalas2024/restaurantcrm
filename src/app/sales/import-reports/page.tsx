"use client";

// Multi-file sync for PetPooja's own report exports (Orders Master, Executive
// Summary, Day End Summary — any mix, any count). Distinct from
// /sales/import, which handles a generic item-wise CSV; these three reports
// carry no per-dish detail, only day-level revenue/payment/covers figures.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { formatINR, formatDate } from "@/lib/format";

type Day = {
  date: string;
  dineInRevenue: number;
  deliveryRevenue: number;
  takeawayRevenue: number;
  otherRevenue: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  covers: number;
  sources: string[];
  warnings: string[];
  hasChannelSplit: boolean;
  hasPaymentSplit: boolean;
};

type FileError = { fileName: string; error: string };

const INPUT = "w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-right tabular-nums";
const LABEL = "mb-1 block text-xs font-medium text-muted";

export default function ImportPetPoojaReportsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "parsing" | "review" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [summary, setSummary] = useState<{ daysImported: number } | null>(null);

  function addFiles(newFiles: FileList | File[]) {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  async function handleParse() {
    if (files.length === 0) return;
    setStatus("parsing");
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/petpooja/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not parse these files.");
        setFileErrors(data.fileErrors ?? []);
        setStatus("error");
        return;
      }
      setDays(data.days);
      setFileErrors(data.fileErrors ?? []);
      const flagged: Record<number, boolean> = {};
      (data.days as Day[]).forEach((d, i) => { if (d.warnings.length) flagged[i] = true; });
      setOpen(flagged);
      setAcknowledged(false);
      setStatus("review");
    } catch {
      setError("Could not reach the server.");
      setStatus("error");
    }
  }

  async function handleImport() {
    setStatus("importing");
    try {
      const res = await fetch("/api/petpooja/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setStatus("error");
        return;
      }
      setSummary(data);
      setStatus("done");
    } catch {
      setError("Import failed.");
      setStatus("error");
    }
  }

  function reset() {
    setFiles([]); setDays([]); setError(null); setFileErrors([]);
    setOpen({}); setAcknowledged(false); setStatus("idle");
  }

  function setDay(i: number, patch: Partial<Day>) {
    setDays((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  }

  const flaggedCount = days.filter((d) => d.warnings.length > 0).length;

  return (
    <div>
      <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to sales
      </Link>
      <PageHeader
        title="Sync PetPooja Reports"
        description="Upload Orders Master, Executive Summary, and/or Day End Summary exports — any mix, any number of days. Each is checked and shown to you before anything is saved."
      />

      {(status === "idle" || status === "parsing" || status === "error") && (
        <Card>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-14 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          >
            <UploadCloud size={32} className="text-brand" />
            <p className="text-sm font-medium">Drag &amp; drop PetPooja report files here, or click to choose</p>
            <p className="text-xs text-muted">Orders Master (.xlsx), Executive Summary (.xls), Day End Summary (.xls) — mix as many as you like</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <button onClick={() => inputRef.current?.click()} className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">
              Choose Files
            </button>
          </div>

          {files.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate"><FileText size={13} className="shrink-0" /> {f.name}</span>
                  <button onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))} className="shrink-0 rounded p-0.5 text-muted hover:text-crit" aria-label="Remove">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          {fileErrors.map((fe, i) => (
            <p key={i} className="mt-2 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span><strong>{fe.fileName}:</strong> {fe.error}</span>
            </p>
          ))}

          <button
            onClick={handleParse}
            disabled={files.length === 0 || status === "parsing"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {status === "parsing" ? <><Loader2 size={16} className="animate-spin" /> Reading reports…</> : "Read Reports"}
          </button>
        </Card>
      )}

      {(status === "review" || status === "importing") && (
        <>
          {fileErrors.length > 0 && (
            <Card className="mb-4">
              {fileErrors.map((fe, i) => (
                <p key={i} className="flex items-start gap-2 text-xs text-warn">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span><strong>{fe.fileName}</strong> was skipped: {fe.error}</span>
                </p>
              ))}
            </Card>
          )}

          {flaggedCount > 0 ? (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span><strong>{flaggedCount} of {days.length} day(s) have a warning.</strong> Usually a missing breakdown (upload the other report type) or two reports disagreeing. Correct any figure below.</span>
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2.5 text-sm text-ok">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <span>All {days.length} day(s) reconcile against each other.</span>
            </p>
          )}

          <Card title={`${days.length} day(s)`}>
            <div className="divide-y divide-border">
              {days.map((d, i) => (
                <div key={d.date} className="py-2">
                  <button onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} className="flex w-full items-center gap-2 text-left">
                    {open[i] ? <ChevronDown size={15} className="shrink-0 text-muted" /> : <ChevronRight size={15} className="shrink-0 text-muted" />}
                    <span className="font-medium">{formatDate(d.date)}</span>
                    {d.warnings.length > 0 ? <Badge tone="warn">{d.warnings.length} issue{d.warnings.length > 1 ? "s" : ""}</Badge> : <Badge tone="ok">OK</Badge>}
                    <span className="ml-auto shrink-0 text-sm font-medium">
                      {formatINR(d.dineInRevenue + d.deliveryRevenue + d.takeawayRevenue + d.otherRevenue, { decimals: true })}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">{d.sources.length} source(s)</span>
                  </button>

                  {open[i] && (
                    <div className="mt-3 space-y-4 pl-6">
                      {d.warnings.length > 0 && (
                        <ul className="space-y-1 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">
                          {d.warnings.map((w, k) => <li key={k} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</li>)}
                        </ul>
                      )}

                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted uppercase">Revenue by channel</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div><label className={LABEL}>Dine-in</label><input type="number" step="any" value={d.dineInRevenue} onChange={(e) => setDay(i, { dineInRevenue: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>Delivery</label><input type="number" step="any" value={d.deliveryRevenue} onChange={(e) => setDay(i, { deliveryRevenue: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>Takeaway</label><input type="number" step="any" value={d.takeawayRevenue} onChange={(e) => setDay(i, { takeawayRevenue: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>Other</label><input type="number" step="any" value={d.otherRevenue} onChange={(e) => setDay(i, { otherRevenue: Number(e.target.value) || 0 })} className={INPUT} /></div>
                        </div>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted uppercase">Payment mode (tax-inclusive)</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div><label className={LABEL}>Cash</label><input type="number" step="any" value={d.cashAmount} onChange={(e) => setDay(i, { cashAmount: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>UPI</label><input type="number" step="any" value={d.upiAmount} onChange={(e) => setDay(i, { upiAmount: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>Card</label><input type="number" step="any" value={d.cardAmount} onChange={(e) => setDay(i, { cardAmount: Number(e.target.value) || 0 })} className={INPUT} /></div>
                          <div><label className={LABEL}>Other</label><input type="number" step="any" value={d.otherPaymentAmount} onChange={(e) => setDay(i, { otherPaymentAmount: Number(e.target.value) || 0 })} className={INPUT} /></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div><label className={LABEL}>Covers (Pax)</label><input type="number" step="any" value={d.covers} onChange={(e) => setDay(i, { covers: Number(e.target.value) || 0 })} className={INPUT} /></div>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-medium text-muted">Sources</p>
                        <ul className="space-y-0.5 text-xs text-muted">
                          {d.sources.map((s, k) => <li key={k}>{s}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-4">
            <p className="mb-3 text-xs text-muted">
              This overwrites each date&apos;s revenue, payment and covers figures with what&apos;s above — any existing menu-item sales for these dates are untouched, since these reports don&apos;t carry per-dish detail.
            </p>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border" />
              <span>
                I&apos;ve checked these figures and they&apos;re correct.
                {flaggedCount > 0 && <span className="text-warn"> ({flaggedCount} day(s) still flagged.)</span>}
              </span>
            </label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleImport}
                disabled={!acknowledged || status === "importing"}
                className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {status === "importing" ? "Saving…" : `Approve & Save ${days.length} Day(s)`}
              </button>
              <button onClick={reset} disabled={status === "importing"} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-50">
                Discard
              </button>
            </div>
          </Card>
        </>
      )}

      {status === "done" && summary && (
        <Card>
          <p className="mb-4 flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 size={18} /> Saved {summary.daysImported} day(s) of sales.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => router.push("/sales")} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              View Sales
            </button>
            <button onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
              Import More
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

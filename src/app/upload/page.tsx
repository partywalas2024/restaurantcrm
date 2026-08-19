"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { BillReview, type ReviewResult } from "@/components/BillReview";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "extracting" | "review" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
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
    setFile(null); setResult(null); setError(null); setStatus("idle");
  }

  return (
    <div>
      <PageHeader
        title="Upload Bills"
        description="Upload a bills PDF or a photo of an invoice. Every figure is read, checked and shown to you — correct anything before it's saved."
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
            {status === "extracting" ? <><Loader2 size={16} className="animate-spin" /> Reading bills…</> : "Read Bills"}
          </button>
          {status === "extracting" && (
            <p className="mt-2 text-center text-xs text-muted">A multi-page PDF can take a minute. Nothing is saved yet.</p>
          )}
        </Card>
      )}

      {(status === "review" || status === "importing") && result && (
        <BillReview
          result={result}
          onChange={setResult}
          onApprove={handleImport}
          onDiscard={reset}
          saving={status === "importing"}
        />
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

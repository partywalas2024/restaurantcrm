"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";

type ExtractedItem = { name: string; unit: string; qty: number; rate: number; amount: number };
type ExtractedBill = {
  billNumber: string;
  type: string;
  date: string;
  grandTotal: number;
  items: ExtractedItem[];
  notes?: string;
};
type ExtractResult = {
  vendor: { name: string; phone?: string; address?: string; gstin?: string };
  bills: ExtractedBill[];
};

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "extracting" | "review" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [importSummary, setImportSummary] = useState<{ billsCreated: number; lineItemsCreated: number } | null>(null);

  async function handleExtract() {
    if (!file) return;
    setStatus("extracting");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Extraction failed.");
        setStatus("error");
        return;
      }
      setResult({ vendor: data.result.vendor, bills: data.result.bills });
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
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setStatus("error");
        return;
      }
      setImportSummary(data);
      setStatus("done");
    } catch {
      setError("Import failed.");
      setStatus("error");
    }
  }

  const totalAmount = result?.bills.reduce((s, b) => s + (b.type === "RETURN" ? -b.grandTotal : b.grandTotal), 0) ?? 0;

  return (
    <div>
      <PageHeader title="Upload Bills" description="Upload a new month's bills PDF — Claude reads and structures every invoice automatically." />

      {status === "idle" || status === "extracting" || status === "error" ? (
        <Card>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border py-14 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <UploadCloud size={32} className="text-brand" />
            <p className="text-sm font-medium">Drag & drop a PDF here, or click to choose a file</p>
            <p className="text-xs text-muted">One or more bills per PDF, up to ~40 pages</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Choose File
            </button>
            {file && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <FileText size={14} /> {file.name}
              </p>
            )}
          </div>

          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
              <AlertCircle size={16} /> {error}
            </p>
          )}

          <button
            onClick={handleExtract}
            disabled={!file || status === "extracting"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {status === "extracting" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Reading bills with Claude…
              </>
            ) : (
              "Extract Bills"
            )}
          </button>
        </Card>
      ) : null}

      {status === "review" && result && (
        <Card
          title={`Review — ${result.vendor.name}`}
          actions={
            <button onClick={handleImport} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Confirm & Import
            </button>
          }
        >
          <p className="mb-3 text-sm text-muted">
            Found {result.bills.length} bill(s), net total {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalAmount)}. Review below, then confirm to save — everything stays editable afterward.
          </p>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="pb-2 pr-3">Bill #</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3 text-right">Items</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.bills.map((b, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{b.billNumber}</td>
                    <td className="py-2 pr-3">{b.date}</td>
                    <td className="py-2 pr-3">{b.type}</td>
                    <td className="py-2 pr-3 text-right">{b.items.length}</td>
                    <td className="py-2 text-right">{b.grandTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {status === "importing" && (
        <Card>
          <p className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> Saving to database…
          </p>
        </Card>
      )}

      {status === "done" && importSummary && (
        <Card>
          <p className="mb-4 flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 size={18} /> Imported {importSummary.billsCreated} bills and {importSummary.lineItemsCreated} line items.
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Go to Dashboard
          </button>
        </Card>
      )}
    </div>
  );
}

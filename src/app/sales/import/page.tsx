"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { FIELD_LABELS, REQUIRED_FIELDS, type SalesField } from "@/lib/sales-import";

type ParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  guessedMapping: Partial<Record<SalesField, string>>;
  truncated: boolean;
  totalRows: number;
};

const FIELDS: SalesField[] = ["date", "itemName", "quantity", "amount", "orderType", "paymentMode", "orderId"];

export default function ImportSalesPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "mapping" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<SalesField, string>>>({});
  const [summary, setSummary] = useState<{ daysImported: number; itemSalesImported: number; rowsSkipped: number } | null>(null);

  async function handleParse() {
    if (!file) return;
    setStatus("parsing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-sales", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not parse the file.");
        setStatus("error");
        return;
      }
      setParsed(data);
      setMapping(data.guessedMapping);
      setStatus("mapping");
    } catch {
      setError("Could not reach the server.");
      setStatus("error");
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setStatus("importing");
    try {
      const res = await fetch("/api/import-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mapping }),
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

  const canImport = REQUIRED_FIELDS.every((f) => mapping[f]);

  return (
    <div>
      <Link href="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to sales
      </Link>
      <PageHeader title="Import Sales" description="Upload a PetPooja (or other POS) sales export — map its columns once, review, then import." />

      {(status === "idle" || status === "parsing" || status === "error") && (
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
            <p className="text-sm font-medium">Drag & drop a .csv or .xlsx export here, or click to choose a file</p>
            <p className="text-xs text-muted">Item-wise sales report works best — one row per item sold</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
              <AlertCircle size={16} /> {error}
            </p>
          )}

          <button
            onClick={handleParse}
            disabled={!file || status === "parsing"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {status === "parsing" ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Reading file…
              </>
            ) : (
              "Read File"
            )}
          </button>
        </Card>
      )}

      {status === "mapping" && parsed && (
        <Card title="Map Columns" actions={<button onClick={handleImport} disabled={!canImport} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">Confirm & Import</button>}>
          <p className="mb-4 text-sm text-muted">
            Found {parsed.totalRows} row{parsed.totalRows === 1 ? "" : "s"}
            {parsed.truncated ? " (truncated to first 20,000)" : ""}. Match each field below to a column from your file — I&apos;ve guessed where I could.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-muted">
                  {FIELD_LABELS[field]} {REQUIRED_FIELDS.includes(field) && <span className="text-crit">*</span>}
                </label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
                >
                  <option value="">— not in file —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <h3 className="mt-6 mb-2 text-sm font-semibold">Preview (first 10 rows)</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  {parsed.headers.map((h) => (
                    <th key={h} className="py-1.5 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {parsed.headers.map((h) => (
                      <td key={h} className="py-1.5 pr-3 whitespace-nowrap">{row[h]}</td>
                    ))}
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
            <Loader2 size={16} className="animate-spin" /> Importing…
          </p>
        </Card>
      )}

      {status === "done" && summary && (
        <Card>
          <p className="mb-4 flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 size={18} /> Imported {summary.daysImported} day(s) of sales, {summary.itemSalesImported} item-sale records.
            {summary.rowsSkipped > 0 && ` ${summary.rowsSkipped} row(s) skipped (missing date/item/quantity).`}
          </p>
          <button onClick={() => router.push("/sales")} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Go to Sales
          </button>
        </Card>
      )}
    </div>
  );
}

import { Download, FileSpreadsheet } from "lucide-react";

type ExportKind = "bills" | "vendors" | "products" | "overview" | "expenses" | "analytics" | "balance-sheet";

function buildQuery(kind: string, searchParams?: Record<string, string | undefined>) {
  const qs = new URLSearchParams({ kind, ...(searchParams ?? {}) } as Record<string, string>);
  for (const [k, v] of Array.from(qs.entries())) {
    if (v === "undefined" || v === "") qs.delete(k);
  }
  return qs.toString();
}

/** CSV is only implemented for flat single-table views; other kinds (overview, analytics, etc) are Excel-only multi-sheet workbooks. */
const CSV_SUPPORTED: ExportKind[] = ["bills", "vendors", "products"];

export function ExportButton({
  kind,
  searchParams,
}: {
  kind: ExportKind;
  searchParams?: Record<string, string | undefined>;
}) {
  const query = buildQuery(kind, searchParams);

  return (
    <div className="inline-flex items-center gap-2">
      {CSV_SUPPORTED.includes(kind) && (
        <a
          href={`/api/export/csv?${query}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
        >
          <Download size={14} /> CSV
        </a>
      )}
      <a
        href={`/api/export/excel?${query}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      >
        <FileSpreadsheet size={14} /> Excel
      </a>
    </div>
  );
}

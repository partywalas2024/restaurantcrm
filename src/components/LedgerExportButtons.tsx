"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { addLetterhead, inr, BRAND_RGB } from "@/lib/pdf";

type RestaurantInfo = { name: string; address?: string | null; phone?: string | null; gstin?: string | null };

function ledgerQuery(vendorId: string, from?: string, to?: string, extra?: Record<string, string>) {
  const q = new URLSearchParams({ vendorId, ...extra });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return q.toString();
}

export function LedgerExportButtons({
  vendorId,
  vendorName,
  restaurant,
  from,
  to,
}: {
  vendorId: string;
  vendorName: string;
  restaurant: RestaurantInfo;
  from?: string;
  to?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function downloadPdf() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger?${ledgerQuery(vendorId, from, to)}`);
      const data = await res.json();

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      const y = addLetterhead(
        doc,
        restaurant,
        "Statement of Account",
        [`Vendor: ${data.vendor.name}`, data.period].filter(Boolean).join(" · ")
      );

      autoTable(doc, {
        startY: y,
        head: [["Date", "Particulars", "Debit", "Credit", "Balance"]],
        body: data.entries.map((e: { date: string; particulars: string; debit: number; credit: number; balance: number }) => [
          e.date,
          e.particulars,
          e.debit ? inr(e.debit) : "",
          e.credit ? inr(e.credit) : "",
          inr(e.balance),
        ]),
        theme: "grid",
        headStyles: { fillColor: BRAND_RGB },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      const billedLabel = data.period ? "Billed in period" : "Total Billed";
      const paidLabel = data.period ? "Paid in period" : "Total Paid / Credited";
      const balanceLabel = data.balance >= 0
        ? data.period ? "Current outstanding (You Owe)" : "Closing Balance (You Owe)"
        : data.period ? "Current outstanding (Vendor Owes You)" : "Closing Balance (Vendor Owes You)";
      doc.text(`${billedLabel}: ${inr(data.totalDebit)}`, 14, finalY);
      doc.text(`${paidLabel}: ${inr(data.totalCredit)}`, 14, finalY + 6);
      doc.setFont("helvetica", "bold");
      doc.text(`${balanceLabel}: ${inr(Math.abs(data.balance))}`, 14, finalY + 14);

      doc.save(`${vendorName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-statement.pdf`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <a
        href={`/api/export/ledger?${ledgerQuery(vendorId, from, to)}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      >
        <FileText size={14} /> CSV
      </a>
      <a
        href={`/api/export/excel?${ledgerQuery(vendorId, from, to, { kind: "ledger" })}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      >
        <FileSpreadsheet size={14} /> Excel
      </a>
      <button
        onClick={downloadPdf}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF
      </button>
    </div>
  );
}

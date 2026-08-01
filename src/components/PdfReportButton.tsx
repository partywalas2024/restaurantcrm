"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { addLetterhead, inr, BRAND_RGB } from "@/lib/pdf";

export function PdfReportButton({
  month,
  restaurant,
}: {
  month: string;
  restaurant: { name: string; address?: string | null; phone?: string | null; gstin?: string | null };
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/report?month=${month}`);
      const data = await res.json();

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      let y = addLetterhead(doc, restaurant, "Monthly Business Report", `Month: ${data.month}`);

      doc.setFontSize(12);
      doc.text("Summary", 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [["Metric", "Value"]],
        body: [
          ["Total Spend", inr(data.totalSpend)],
          ["Previous Month", inr(data.prevSpend)],
          ["Total Bills", String(data.totalBills)],
          ["Current Stock Value", inr(data.stockValue)],
          ["Low Stock Items", String(data.lowStockCount)],
          ["Pending Payments", inr(data.pendingPayments)],
        ],
        theme: "grid",
        headStyles: { fillColor: BRAND_RGB },
        margin: { left: 14, right: 14 },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("Insights", 14, y);
      doc.setFontSize(10);
      y += 6;
      for (const line of data.insights as string[]) {
        const split = doc.splitTextToSize(`• ${line}`, 180);
        doc.text(split, 14, y);
        y += split.length * 5 + 2;
      }

      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Category", "Amount"]],
        body: (data.categorySpend as { label: string; amount: number }[]).map((c) => [c.label, inr(c.amount)]),
        theme: "grid",
        headStyles: { fillColor: BRAND_RGB },
        margin: { left: 14, right: 14 },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("Top 10 Most Expensive Purchases", 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [["Bill #", "Date", "Vendor", "Amount"]],
        body: (data.topBills as { billNumber: string; date: string; vendor: string; amount: number }[]).map((b) => [
          b.billNumber,
          b.date,
          b.vendor,
          inr(b.amount),
        ]),
        theme: "grid",
        headStyles: { fillColor: BRAND_RGB },
        margin: { left: 14, right: 14 },
      });

      doc.save(`${restaurant.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report-${data.month}.pdf`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      PDF Report
    </button>
  );
}

"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { addLetterhead, inr, BRAND_RGB } from "@/lib/pdf";

export function ReceiptButton({ paymentId }: { paymentId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payment?paymentId=${paymentId}`);
      if (!res.ok) return;
      const data = await res.json();
      const { payment, vendor, restaurant } = data;

      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      const y = addLetterhead(doc, restaurant, "Payment Receipt", `Receipt Date: ${payment.date}`);

      autoTable(doc, {
        startY: y,
        body: [
          ["Paid To", vendor.name],
          ...(vendor.gstin ? [["Vendor GSTIN", vendor.gstin]] : []),
          ["Amount Paid", inr(payment.amount)],
          ["Payment Method", payment.method],
          ...(payment.reference ? [["Reference", payment.reference]] : []),
          ...(payment.notes ? [["Notes", payment.notes]] : []),
        ],
        theme: "plain",
        styles: { fontSize: 11, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      doc.setFontSize(14);
      doc.setTextColor(...BRAND_RGB);
      doc.text(`Amount: ${inr(payment.amount)}`, 14, finalY);

      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text("This receipt confirms payment made by the restaurant to the vendor above.", 14, finalY + 14);

      doc.save(`${vendor.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-receipt-${payment.date.replace(/\s+/g, "-")}.pdf`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className="inline-flex items-center gap-1 text-xs text-brand hover:underline disabled:opacity-50">
      {loading ? <Loader2 size={11} className="animate-spin" /> : null} Receipt
    </button>
  );
}

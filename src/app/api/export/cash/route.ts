// Cash book CSV export — same filters as the /cash page.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { apiRestaurantGuard } from "@/lib/auth";
import { getCashBook, CASH_KIND_LABEL, type CashKind } from "@/lib/cashbook";

export async function GET(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") as CashKind | null;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);

  const book = await getCashBook(guard.user.restaurantId, {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    dir: sp.get("dir") === "IN" || sp.get("dir") === "OUT" ? (sp.get("dir") as "IN" | "OUT") : undefined,
    kind: kind && kind in CASH_KIND_LABEL ? kind : undefined,
    q: sp.get("q") || undefined,
    party: sp.get("party") || undefined,
    min: num("min"),
    max: num("max"),
  });

  const rows = [...book.rows].reverse().map((e) => ({
    Date: e.date.toISOString().slice(0, 10),
    Type: CASH_KIND_LABEL[e.kind],
    Description: e.description,
    Explanation: e.explanation ?? "",
    "Paid to / from": e.party ?? "",
    "Cash In": e.direction === "IN" ? e.amount.toFixed(2) : "",
    "Cash Out": e.direction === "OUT" ? e.amount.toFixed(2) : "",
    Balance: e.balance.toFixed(2),
    "Entered by": e.enteredBy ?? "",
  }));

  return new NextResponse(Papa.unparse(rows), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="cash-book.csv"' },
  });
}

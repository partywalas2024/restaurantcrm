// The Cash Book: every rupee of CASH that came in or went out, in one register.
//
//   IN   daily-sales cash (DailySales.cashAmount — read, never re-entered)
//        cash receipts (party advances, deposits, owner top-up... — CashReceipt)
//   OUT  cash expenses (Expense with paymentMethod CASH)
//        vendor payments made in cash (Payment with method CASH)
//
// The balance is built only from what has been recorded: the opening balance is
// the net of every recorded cash entry before the chosen start date, so the
// book is only as complete as the entries are. Filters narrow the rows shown
// but the running balance always reflects the full register.

import { prisma } from "@/lib/prisma";

export type CashKind = "SALES" | "RECEIPT" | "EXPENSE" | "VENDOR_PAYMENT";

export const CASH_KIND_LABEL: Record<CashKind, string> = {
  SALES: "Cash sales",
  RECEIPT: "Cash received",
  EXPENSE: "Cash expense",
  VENDOR_PAYMENT: "Vendor payment",
};

export const RECEIPT_KIND_LABEL: Record<string, string> = {
  PARTY_ADVANCE: "Party / event advance",
  DEPOSIT: "Deposit",
  OWNER_TOPUP: "Owner top-up",
  CUSTOMER_PAYMENT: "Customer payment",
  OTHER: "Other",
};

export type CashFilters = {
  from?: string;
  to?: string;
  dir?: "IN" | "OUT";
  kind?: CashKind;
  q?: string;
  party?: string;
  min?: number;
  max?: number;
};

export type CashEntry = {
  key: string;
  refId: string;
  kind: CashKind;
  direction: "IN" | "OUT";
  date: Date;
  amount: number;
  description: string;
  explanation: string | null;
  party: string | null;
  label: string | null;
  enteredBy: string | null;
  link: string | null;
};

const KIND_ORDER: Record<CashKind, number> = { SALES: 0, RECEIPT: 1, EXPENSE: 2, VENDOR_PAYMENT: 3 };

function day(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function getCashBook(restaurantId: string, f: CashFilters) {
  const from = day(f.from);
  const to = day(f.to, true);
  const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const hasRange = from || to;

  const [sales, receipts, expenses, payments, prior] = await Promise.all([
    prisma.dailySales.findMany({
      where: { restaurantId, cashAmount: { gt: 0 }, ...(hasRange ? { date: range } : {}) },
      select: { id: true, date: true, cashAmount: true },
    }),
    prisma.cashReceipt.findMany({ where: { restaurantId, ...(hasRange ? { date: range } : {}) } }),
    prisma.expense.findMany({ where: { restaurantId, paymentMethod: "CASH", ...(hasRange ? { date: range } : {}) } }),
    prisma.payment.findMany({
      where: { vendor: { restaurantId }, method: "CASH", ...(hasRange ? { date: range } : {}) },
      include: { vendor: { select: { id: true, name: true } } },
    }),
    // Everything recorded before the start date becomes the opening balance.
    from
      ? Promise.all([
          prisma.dailySales.aggregate({ where: { restaurantId, date: { lt: from } }, _sum: { cashAmount: true } }),
          prisma.cashReceipt.aggregate({ where: { restaurantId, date: { lt: from } }, _sum: { amount: true } }),
          prisma.expense.aggregate({ where: { restaurantId, paymentMethod: "CASH", date: { lt: from } }, _sum: { amount: true } }),
          prisma.payment.aggregate({ where: { vendor: { restaurantId }, method: "CASH", date: { lt: from } }, _sum: { amount: true } }),
        ])
      : Promise.resolve(null),
  ]);

  const opening = prior
    ? (prior[0]._sum.cashAmount ?? 0) + (prior[1]._sum.amount ?? 0) - (prior[2]._sum.amount ?? 0) - (prior[3]._sum.amount ?? 0)
    : 0;

  const all: CashEntry[] = [
    ...sales.map<CashEntry>((s) => ({
      key: `S-${s.id}`, refId: s.id, kind: "SALES", direction: "IN", date: s.date, amount: s.cashAmount,
      description: "Cash collected from sales", explanation: null, party: null, label: null, enteredBy: null,
      link: `/sales/entry?date=${s.date.toISOString().slice(0, 10)}`,
    })),
    ...receipts.map<CashEntry>((r) => ({
      key: `R-${r.id}`, refId: r.id, kind: "RECEIPT", direction: "IN", date: r.date, amount: r.amount,
      description: r.description, explanation: r.explanation, party: r.receivedFrom,
      label: RECEIPT_KIND_LABEL[r.kind] ?? r.kind, enteredBy: r.createdByName, link: `/cash/receipts/${r.id}`,
    })),
    ...expenses.map<CashEntry>((e) => ({
      key: `E-${e.id}`, refId: e.id, kind: "EXPENSE", direction: "OUT", date: e.date, amount: e.amount,
      description: e.description, explanation: e.explanation, party: e.paidTo, label: e.category,
      enteredBy: e.createdByName, link: `/expenses/cash/${e.id}`,
    })),
    ...payments.map<CashEntry>((p) => ({
      key: `P-${p.id}`, refId: p.id, kind: "VENDOR_PAYMENT", direction: "OUT", date: p.date, amount: p.amount,
      description: `Payment to ${p.vendor.name}`, explanation: p.notes, party: p.vendor.name, label: null,
      enteredBy: null, link: `/vendors/${p.vendor.id}`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  // Running balance over the FULL register in range, before any row filtering.
  let bal = opening;
  const withBalance = all.map((e) => {
    bal += e.direction === "IN" ? e.amount : -e.amount;
    return { ...e, balance: bal };
  });

  const q = f.q?.trim().toLowerCase();
  const shown = withBalance
    .filter((e) => !f.dir || e.direction === f.dir)
    .filter((e) => !f.kind || e.kind === f.kind)
    .filter((e) => !f.party || (e.party ?? "").toLowerCase() === f.party.toLowerCase())
    .filter((e) => f.min === undefined || e.amount >= f.min)
    .filter((e) => f.max === undefined || e.amount <= f.max)
    .filter((e) => !q || `${e.description} ${e.explanation ?? ""} ${e.party ?? ""} ${e.label ?? ""}`.toLowerCase().includes(q))
    .reverse(); // newest first

  const sum = (dir: "IN" | "OUT") => shown.filter((e) => e.direction === dir).reduce((s, e) => s + e.amount, 0);
  const parties = Array.from(new Set(withBalance.map((e) => e.party).filter((p): p is string => Boolean(p)))).sort((a, b) => a.localeCompare(b));

  return {
    rows: shown,
    parties,
    totals: { in: sum("IN"), out: sum("OUT"), net: sum("IN") - sum("OUT") },
    opening,
    closing: bal,
  };
}

export async function getCashReceiptById(restaurantId: string, id: string) {
  return prisma.cashReceipt.findFirst({ where: { id, restaurantId } });
}

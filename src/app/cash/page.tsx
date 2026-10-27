import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Scale, BookOpen, Pencil, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, EmptyState } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CashReceiptForm } from "@/components/CashReceiptForm";
import { getCashBook, CASH_KIND_LABEL, RECEIPT_KIND_LABEL, type CashKind, type CashFilters } from "@/lib/cashbook";
import { deleteCashReceipt } from "@/lib/cash-actions";
import { requireRestaurantUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatDate, formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = { from?: string; to?: string; dir?: string; kind?: string; q?: string; party?: string; min?: string; max?: string };

const KINDS = Object.keys(CASH_KIND_LABEL) as CashKind[];
const INPUT = "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";

function num(v?: string) {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default async function CashBookPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireRestaurantUser();
  const owner = isOwner(user.role);

  const filters: CashFilters = {
    from: sp.from || undefined,
    to: sp.to || undefined,
    dir: sp.dir === "IN" || sp.dir === "OUT" ? sp.dir : undefined,
    kind: KINDS.includes(sp.kind as CashKind) ? (sp.kind as CashKind) : undefined,
    q: sp.q || undefined,
    party: sp.party || undefined,
    min: num(sp.min),
    max: num(sp.max),
  };
  const book = await getCashBook(user.restaurantId, filters);
  const filtered = Boolean(filters.dir || filters.kind || filters.q || filters.party || filters.min !== undefined || filters.max !== undefined);
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        title="Cash Book"
        description="Every rupee of cash in and out — cash sales, cash received, cash expenses and cash paid to vendors — with a running balance"
        actions={
          <>
            <Link href="/expenses/cash" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">Add Cash Expense</Link>
            <a href={`/api/export/cash?${exportQs}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
              <Download size={14} /> CSV
            </a>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Opening Balance" value={formatINR(book.opening)} icon={BookOpen} sublabel={filters.from ? `before ${formatDate(filters.from)}` : "start of records"} />
        <StatCard label={filtered ? "Cash In (filtered)" : "Cash In"} value={formatINR(book.totals.in)} icon={ArrowDownLeft} tone="ok" />
        <StatCard label={filtered ? "Cash Out (filtered)" : "Cash Out"} value={formatINR(book.totals.out)} icon={ArrowUpRight} tone="warn" />
        <StatCard label="Closing Balance" value={formatINR(book.closing)} icon={Scale} tone={book.closing < 0 ? "crit" : "info"} sublabel={filters.to ? `as of ${formatDate(filters.to)}` : "now"} />
      </div>

      <Card className="mt-6">
        <form method="GET" className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <div><label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-from">From</label><input id="f-from" type="date" name="from" defaultValue={sp.from} className={`${INPUT} w-full`} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-to">To</label><input id="f-to" type="date" name="to" defaultValue={sp.to} className={`${INPUT} w-full`} /></div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-dir">Direction</label>
            <select id="f-dir" name="dir" defaultValue={sp.dir ?? ""} className={`${INPUT} w-full`}>
              <option value="">In &amp; out</option><option value="IN">Cash in</option><option value="OUT">Cash out</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-kind">Type</label>
            <select id="f-kind" name="kind" defaultValue={sp.kind ?? ""} className={`${INPUT} w-full`}>
              <option value="">All types</option>
              {KINDS.map((k) => (<option key={k} value={k}>{CASH_KIND_LABEL[k]}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-party">Paid to / from</label>
            <select id="f-party" name="party" defaultValue={sp.party ?? ""} className={`${INPUT} w-full`}>
              <option value="">Anyone</option>
              {book.parties.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-min">Min ₹</label><input id="f-min" type="number" name="min" defaultValue={sp.min} className={`${INPUT} w-full`} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-max">Max ₹</label><input id="f-max" type="number" name="max" defaultValue={sp.max} className={`${INPUT} w-full`} /></div>
          <div><label className="mb-1 block text-xs font-medium text-muted" htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={sp.q} placeholder="description…" className={`${INPUT} w-full`} /></div>
          <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-8">
            <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Apply Filters</button>
            <Link href="/cash" className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-surface-muted">Reset</Link>
          </div>
        </form>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title={`Register (${book.rows.length})`} className="lg:col-span-2">
          {book.rows.length === 0 ? (
            <EmptyState title="No cash entries match" description="Widen the dates or clear a filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Entry</th>
                    <th className="pb-2 pr-3 text-right">In</th>
                    <th className="pb-2 pr-3 text-right">Out</th>
                    <th className="pb-2 pr-3 text-right">Balance</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {book.rows.map((e) => (
                    <tr key={e.key} className="border-b border-border/60 align-top last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{formatDate(e.date)}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">
                          {e.link ? <Link href={e.link} className="hover:text-brand hover:underline">{e.description}</Link> : e.description}
                        </p>
                        {e.explanation && <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{e.explanation}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <Badge tone={e.direction === "IN" ? "ok" : "warn"}>{CASH_KIND_LABEL[e.kind]}</Badge>
                          {e.label && <span>{e.kind === "EXPENSE" ? CATEGORY_LABELS[e.label as keyof typeof CATEGORY_LABELS] ?? e.label : e.label}</span>}
                          {e.party && <span>{e.direction === "IN" ? "from" : "to"} {e.party}</span>}
                          {e.enteredBy && <span>entered by {e.enteredBy}</span>}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium text-ok">{e.direction === "IN" ? formatINR(e.amount, { decimals: true }) : ""}</td>
                      <td className="py-2.5 pr-3 text-right font-medium">{e.direction === "OUT" ? formatINR(e.amount, { decimals: true }) : ""}</td>
                      <td className={`py-2.5 pr-3 text-right ${e.balance < 0 ? "text-crit" : "text-muted"}`}>{formatINR(e.balance, { decimals: true })}</td>
                      <td className="py-2.5 text-right">
                        {owner && e.kind === "RECEIPT" && (
                          <div className="flex items-center justify-end gap-3 text-xs font-medium">
                            <Link href={`/cash/receipts/${e.refId}`} className="inline-flex items-center gap-1 text-brand hover:underline"><Pencil size={11} /> Edit</Link>
                            <form action={deleteCashReceipt}>
                              <input type="hidden" name="id" value={e.refId} />
                              <ConfirmButton message={`Delete this cash receipt (${formatINR(e.amount)})?`} className="text-crit hover:underline">Delete</ConfirmButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Balance is built only from recorded entries, so it is as complete as they are. Cash sales come from daily sales entries. Expense and vendor-payment rows link to where they can be edited by the Owner.
          </p>
        </Card>

        <Card title="Add Cash Received">
          <CashReceiptForm kindOptions={Object.entries(RECEIPT_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        </Card>
      </div>
    </div>
  );
}

// Parses PetPooja's own exported reports — not a generic CSV, three fixed
// report layouts PetPooja itself produces:
//
//   - "Orders: Master Report"        (real .xlsx, one row per order)
//   - "Executive Sales Report Summary" (.xls, actually an HTML table — a
//     single-day KPI rollup: order-type and payment-mode breakdowns)
//   - "Day End Report Summary"       (.xls, actually an HTML table — a
//     single calendar day's cash/card/UPI reconciliation + covers)
//
// None of the three carries per-dish detail, so this feeds DailySales only —
// never MenuItemSale. Each report answers a different question about the same
// day, so figures are merged with an explicit precedence (see mergeDayInputs)
// and any disagreement between sources is surfaced as a warning rather than
// silently averaged or dropped.

import ExcelJS from "exceljs";
import { classifyChannel, classifyPayment } from "@/lib/sales-import";

export type PetPoojaReportType = "orders_master" | "executive_summary" | "day_end";

export const REPORT_TYPE_LABELS: Record<PetPoojaReportType, string> = {
  orders_master: "Orders: Master Report",
  executive_summary: "Executive Sales Summary",
  day_end: "Day End Summary",
};

type ChannelKey = "dineIn" | "delivery" | "takeaway" | "other";
type PaymentKey = "cash" | "upi" | "card" | "other";

/** One report's contribution for a single calendar day. Fields are omitted, not zeroed, when that report doesn't answer that question. */
export type ParsedDayInput = {
  date: string; // YYYY-MM-DD, local
  reportType: PetPoojaReportType;
  fileName: string;
  channelRevenue?: Partial<Record<ChannelKey, number>>;
  paymentAmounts?: Partial<Record<PaymentKey, number>>;
  covers?: number;
  orderCount?: number;
  grandTotal?: number;
  netSales?: number;
};

export type MergedDay = {
  date: string;
  dineInRevenue: number;
  deliveryRevenue: number;
  takeawayRevenue: number;
  otherRevenue: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  covers: number;
  sources: string[]; // e.g. ["Day End Summary (day-end-04-sep.xls)", ...]
  warnings: string[];
  hasChannelSplit: boolean;
  hasPaymentSplit: boolean;
};

// ---- shared small helpers ----

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseCount(raw: string | undefined): number {
  const n = parseInt((raw ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Local-date key, matching how the rest of the app keys DailySales — never UTC-shifted. */
function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseFreeDate(raw: string): string | null {
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return toDateKey(d);
}

// ---- HTML report parsing (Executive Summary + Day End are both PetPooja-generated HTML tables saved with a .xls extension) ----

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

type HtmlRow = { section: string; cells: string[] };

/**
 * PetPooja's export template groups rows under section-banner rows (a single
 * bold cell spanning the row via `colspan`). A bold row WITHOUT `colspan` is a
 * column-header row for the section, not a new section — the template reuses
 * bold styling for both, so `colspan` is the only reliable signal that
 * separates "new section starts here" from "these are the column names".
 */
function parseHtmlRows(html: string): HtmlRow[] {
  const rows: HtmlRow[] = [];
  let currentSection = "";
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    const rowHtml = m[1];
    const cellPieces = rowHtml.split(/<t[dh][^>]*>/i).slice(1);
    const cells = cellPieces.map((piece) => decodeEntities(stripTags(piece)).replace(/\s+/g, " ").trim());
    const nonEmpty = cells.filter((c) => c !== "");
    if (nonEmpty.length === 0) continue;

    const isBold = /<b>/i.test(rowHtml);
    const isSectionTitle = isBold && /colspan=/i.test(rowHtml);
    if (isSectionTitle) {
      currentSection = nonEmpty[0];
      continue;
    }
    if (isBold) continue; // column-header row for the current section — not data

    rows.push({ section: currentSection, cells });
  }
  return rows;
}

/** Builds a label -> value map from a section's 2-column rows (trailing colons on labels stripped). */
function toKeyValueMap(rows: HtmlRow[], section: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.section !== section) continue;
    if (r.cells.length < 2) continue;
    const key = r.cells[0].replace(/:\s*$/, "").trim();
    map.set(key, r.cells[1]);
  }
  return map;
}

function reportName(rootMap: Map<string, string>): string | undefined {
  return rootMap.get("Name");
}

function parseDayEndSummary(html: string, fileName: string): ParsedDayInput | { error: string } {
  const rows = parseHtmlRows(html);
  const root = toKeyValueMap(rows, ""); // Day End has no sections at all — everything is in the root bucket

  const dateStr = root.get("Date");
  if (!dateStr) return { error: `${fileName}: couldn't find a "Date" field — is this really a Day End Summary export?` };
  const date = parseFreeDate(dateStr);
  if (!date) return { error: `${fileName}: couldn't parse the date "${dateStr}".` };

  const cash = parseMoney(root.get("Cash"));
  const card = parseMoney(root.get("Card"));
  const upi = parseMoney(root.get("UPI"));
  // Schema only has cash/upi/card/other — everything PetPooja separates beyond
  // that (wallet, aggregator "online", unsettled "due", its own misc "other")
  // folds into our single "other" bucket. Nothing is dropped, only regrouped.
  const other = parseMoney(root.get("Wallet")) + parseMoney(root.get("Online")) + parseMoney(root.get("Due")) + parseMoney(root.get("Other"));

  return {
    date,
    reportType: "day_end",
    fileName,
    paymentAmounts: { cash, upi, card, other },
    covers: parseCount(root.get("Total Pax")),
    orderCount: parseCount(root.get("Count")),
    grandTotal: parseMoney(root.get("Grand Total")),
    netSales: parseMoney(root.get("Net Sales")),
  };
}

function parseExecutiveSummary(html: string, fileName: string): ParsedDayInput | { error: string } {
  const rows = parseHtmlRows(html);
  const root = toKeyValueMap(rows, "");

  const period = root.get("Period");
  if (!period) return { error: `${fileName}: couldn't find a "Period" field — is this really an Executive Sales Summary export?` };
  const [fromRaw, toRaw] = period.split(/\s+To\s+/i);
  const from = fromRaw ? parseFreeDate(fromRaw) : null;
  const to = toRaw ? parseFreeDate(toRaw) : null;
  if (!from || !to) return { error: `${fileName}: couldn't parse the period "${period}".` };
  if (from !== to) {
    return {
      error: `${fileName}: covers ${fromRaw} to ${toRaw} — this importer only accepts a single-day Executive Summary, because a multi-day export can't be split back into individual days. Re-export one day at a time.`,
    };
  }

  const billing = toKeyValueMap(rows, "Billing (Success)");

  const channelRevenue: Partial<Record<ChannelKey, number>> = {};
  for (const r of rows) {
    if (r.section !== "Order Type" || r.cells.length < 4) continue;
    const channel = classifyChannel(r.cells[0]);
    const netSales = parseMoney(r.cells[3]);
    channelRevenue[channel] = (channelRevenue[channel] ?? 0) + netSales;
  }

  const paymentAmounts: Partial<Record<PaymentKey, number>> = {};
  for (const r of rows) {
    if (r.section !== "Payment Mode" || r.cells.length < 2) continue;
    const bucket = classifyPayment(r.cells[0]);
    paymentAmounts[bucket] = (paymentAmounts[bucket] ?? 0) + parseMoney(r.cells[1]);
  }

  return {
    date: from,
    reportType: "executive_summary",
    fileName,
    channelRevenue,
    paymentAmounts,
    orderCount: parseCount(billing.get("Count")),
    grandTotal: parseMoney(billing.get("Grand Total")),
    netSales: parseMoney(billing.get("Net Sales")),
  };
}

// ---- Orders Master Report (.xlsx, real spreadsheet, one row per order) ----

async function parseOrdersMaster(buffer: Buffer, fileName: string): Promise<ParsedDayInput[] | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { error: `${fileName}: couldn't read this as an Excel file.` };
  }
  const sheet = wb.worksheets[0];
  if (!sheet) return { error: `${fileName}: no sheets found.` };

  // The header row is wherever "Invoice No." appears in column A — everything
  // above it is report metadata, and PetPooja inserts Total/Min/Max/Avg
  // summary rows directly below the header before the real per-order rows.
  let headerRowNum = -1;
  sheet.eachRow((row, num) => {
    if (headerRowNum === -1 && String(row.getCell(1).value ?? "").trim() === "Invoice No.") headerRowNum = num;
  });
  if (headerRowNum === -1) {
    return { error: `${fileName}: couldn't find an "Invoice No." column — is this really an Orders Master Report?` };
  }

  const headerRow = sheet.getRow(headerRowNum);
  const colIndex = new Map<string, number>();
  headerRow.eachCell((cell, col) => colIndex.set(String(cell.value ?? "").trim(), col));

  const find = (predicate: (h: string) => boolean): number | undefined => {
    for (const [h, i] of colIndex) if (predicate(h)) return i;
    return undefined;
  };
  const dateCol = colIndex.get("Date");
  const orderTypeCol = colIndex.get("Order Type");
  const paymentTypeCol = colIndex.get("Payment Type");
  const netSalesCol = find((h) => h.startsWith("Net Sales"));
  const grandTotalCol = find((h) => h === "Total (₹)");
  const invoiceCol = colIndex.get("Invoice No.");

  if (!dateCol || !orderTypeCol || !paymentTypeCol || !netSalesCol || !invoiceCol || !grandTotalCol) {
    return { error: `${fileName}: missing an expected column (Date, Order Type, Payment Type, Net Sales, Total or Invoice No.) — the report layout may have changed.` };
  }

  type Bucket = {
    channelRevenue: Partial<Record<ChannelKey, number>>;
    paymentAmounts: Partial<Record<PaymentKey, number>>;
    grandTotal: number;
    netSales: number;
    invoices: Set<string>;
  };
  const byDate = new Map<string, Bucket>();

  sheet.eachRow((row, num) => {
    if (num <= headerRowNum) return;
    const invoiceRaw = row.getCell(invoiceCol).value;
    // Total/Min/Max/Avg rows carry no invoice number — a real order always does.
    if (invoiceRaw === null || invoiceRaw === undefined || invoiceRaw === "") return;
    if (typeof invoiceRaw !== "number" && Number.isNaN(Number(invoiceRaw))) return;

    const dateCellRaw = row.getCell(dateCol).value;
    const dateStr = dateCellRaw instanceof Date ? toDateKey(dateCellRaw) : parseFreeDate(String(dateCellRaw ?? ""));
    if (!dateStr) return;

    const orderType = String(row.getCell(orderTypeCol).value ?? "");
    const paymentType = String(row.getCell(paymentTypeCol).value ?? "");
    const netSales = Number(row.getCell(netSalesCol).value) || 0;
    const grandTotal = Number(row.getCell(grandTotalCol).value) || 0;

    const bucket = byDate.get(dateStr) ?? {
      channelRevenue: {},
      paymentAmounts: {},
      grandTotal: 0,
      netSales: 0,
      invoices: new Set<string>(),
    };
    // Channel split uses Net Sales (pre-tax business revenue, matching the
    // schema's *Revenue fields and how the P&L uses them). Payment split uses
    // the tax-inclusive grand total instead — that's the actual amount
    // collected per payment mode, which is how PetPooja's own Executive
    // Summary and Day End reports both report it (their payment-mode figures
    // sum to the grand total, not net sales) — matching that keeps this
    // report's numbers reconcilable against the other two.
    const channel = classifyChannel(orderType);
    bucket.channelRevenue[channel] = (bucket.channelRevenue[channel] ?? 0) + netSales;
    const payment = classifyPayment(paymentType);
    bucket.paymentAmounts[payment] = (bucket.paymentAmounts[payment] ?? 0) + grandTotal;
    bucket.grandTotal += grandTotal;
    bucket.netSales += netSales;
    bucket.invoices.add(String(invoiceRaw));
    byDate.set(dateStr, bucket);
  });

  if (byDate.size === 0) {
    return { error: `${fileName}: no order rows found (only summary rows or none at all).` };
  }

  return Array.from(byDate.entries()).map(([date, b]) => ({
    date,
    reportType: "orders_master" as const,
    fileName,
    channelRevenue: b.channelRevenue,
    paymentAmounts: b.paymentAmounts,
    orderCount: b.invoices.size,
    grandTotal: b.grandTotal,
    netSales: b.netSales,
  }));
}

// ---- detection + top-level entry point ----

export async function parsePetPoojaFile(
  file: File,
): Promise<{ inputs: ParsedDayInput[] } | { error: string }> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith(".xlsx")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseOrdersMaster(buffer, name);
    return "error" in result ? result : { inputs: result };
  }

  if (lower.endsWith(".xls")) {
    // PetPooja's "Executive Summary" and "Day End Summary" exports are HTML
    // tables saved with a .xls extension, not real spreadsheets.
    const html = await file.text();
    const rows = parseHtmlRows(html);
    const root = toKeyValueMap(rows, "");
    const name_ = reportName(root);

    if (name_ === "Day End Report Summary") {
      const result = parseDayEndSummary(html, name);
      return "error" in result ? result : { inputs: [result] };
    }
    if (name_ === "Executive Sales Report Summary") {
      const result = parseExecutiveSummary(html, name);
      return "error" in result ? result : { inputs: [result] };
    }
    return { error: `${name}: this doesn't look like a PetPooja Day End or Executive Summary export (no recognizable report name found).` };
  }

  return { error: `${name}: expected a PetPooja export (.xlsx or .xls) — got an unrecognized file type.` };
}

// ---- merge: multiple reports, possibly for multiple days, into one row per day ----

const TOLERANCE = 5; // rupees of slack for rounding differences between reports

function money(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function mergeDayInputs(inputs: ParsedDayInput[]): MergedDay[] {
  const byDate = new Map<string, ParsedDayInput[]>();
  for (const input of inputs) {
    byDate.set(input.date, [...(byDate.get(input.date) ?? []), input]);
  }

  const priority: PetPoojaReportType[] = ["executive_summary", "orders_master", "day_end"];
  const paymentPriority: PetPoojaReportType[] = ["day_end", "executive_summary", "orders_master"];

  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, dayInputs]) => {
      const bySourceType = new Map(dayInputs.map((i) => [i.reportType, i]));
      const warnings: string[] = [];

      const channelSource = priority.find((t) => bySourceType.get(t)?.channelRevenue);
      const channel = channelSource ? bySourceType.get(channelSource)!.channelRevenue! : undefined;

      const paymentSource = paymentPriority.find((t) => bySourceType.get(t)?.paymentAmounts);
      const payment = paymentSource ? bySourceType.get(paymentSource)!.paymentAmounts! : undefined;

      const coversInput = dayInputs.find((i) => i.covers !== undefined);

      // Cross-check: if two or more sources both report a grand total for this day, they should agree.
      const grandTotals = dayInputs.filter((i) => i.grandTotal !== undefined).map((i) => ({ type: i.reportType, value: i.grandTotal! }));
      for (let i = 1; i < grandTotals.length; i++) {
        if (Math.abs(grandTotals[i].value - grandTotals[0].value) > TOLERANCE) {
          warnings.push(
            `${REPORT_TYPE_LABELS[grandTotals[0].type]} reports a grand total of ${money(grandTotals[0].value)} but ${REPORT_TYPE_LABELS[grandTotals[i].type]} reports ${money(grandTotals[i].value)} for the same day.`,
          );
        }
      }

      if (!channel) {
        warnings.push("No revenue-by-channel breakdown was in any uploaded report for this date — enter it manually, or upload an Executive Summary / Orders Master report that includes it.");
      }
      if (!payment) {
        warnings.push("No payment-mode breakdown was in any uploaded report for this date — enter it manually, or upload a Day End Summary that includes it.");
      }

      const dineInRevenue = channel?.dineIn ?? 0;
      const deliveryRevenue = channel?.delivery ?? 0;
      const takeawayRevenue = channel?.takeaway ?? 0;
      const otherRevenue = channel?.other ?? 0;
      const cashAmount = payment?.cash ?? 0;
      const upiAmount = payment?.upi ?? 0;
      const cardAmount = payment?.card ?? 0;
      const otherPaymentAmount = payment?.other ?? 0;

      // Self-consistency: the channel split (net sales) should sum to whatever
      // net-sales figure any source reported directly, and the payment split
      // (grand total basis) should sum to whatever grand total any source
      // reported directly. A mismatch here means the classifier put an order
      // into the wrong bucket, not that the sources disagree with each other.
      if (channel) {
        const channelSum = dineInRevenue + deliveryRevenue + takeawayRevenue + otherRevenue;
        const reportedNetSales = dayInputs.find((i) => i.netSales !== undefined)?.netSales;
        if (reportedNetSales !== undefined && Math.abs(channelSum - reportedNetSales) > TOLERANCE) {
          warnings.push(`Revenue by channel sums to ${money(channelSum)} but net sales was reported as ${money(reportedNetSales)}.`);
        }
      }
      if (payment) {
        const paymentSum = cashAmount + upiAmount + cardAmount + otherPaymentAmount;
        const reportedGrandTotal = dayInputs.find((i) => i.grandTotal !== undefined)?.grandTotal;
        if (reportedGrandTotal !== undefined && Math.abs(paymentSum - reportedGrandTotal) > TOLERANCE) {
          warnings.push(`Revenue by payment mode sums to ${money(paymentSum)} but the grand total was reported as ${money(reportedGrandTotal)}.`);
        }
      }

      return {
        date,
        dineInRevenue,
        deliveryRevenue,
        takeawayRevenue,
        otherRevenue,
        cashAmount,
        upiAmount,
        cardAmount,
        otherPaymentAmount,
        covers: coversInput?.covers ?? 0,
        sources: dayInputs.map((i) => `${REPORT_TYPE_LABELS[i.reportType]} (${i.fileName})`),
        warnings,
        hasChannelSplit: Boolean(channel),
        hasPaymentSplit: Boolean(payment),
      };
    });
}

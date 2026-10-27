// Reads a bank / UPI statement into candidate expense rows.
//
// Only money OUT (debits) is kept. Every row is also checked against what is
// already in the books so a statement import can't quietly double count:
//   - a payment to a known vendor belongs in that vendor's ledger (the bill is
//     already an expense) — flagged `vendorMatch`
//   - the same date + amount already entered as an expense — flagged `duplicate`
// Nothing here saves anything; the review screen decides what gets imported.

import "server-only";

import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import type { ProductCategory } from "@/generated/prisma/enums";

export type StatementRow = { date: string; description: string; amount: number; reference: string | null };
export type AnnotatedRow = StatementRow & {
  category: ProductCategory;
  duplicate: string | null;
  vendorMatch: string | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Accepts 2026-10-05, 05/10/2026, 05-10-26, 5 Oct 2026, 05-Oct-26. Indian statements are day-first. */
export function parseStatementDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[\/\-. ]+(\d{1,2}|[A-Za-z]{3,9})[\/\-. ,]+(\d{2,4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return iso(year, month, day);
}

export function parseStatementAmount(raw: unknown): number | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[₹,\s]|rs\.?|inr|dr|cr|[()]/gi, "").replace(/^-/, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const KEYWORDS: [RegExp, ProductCategory][] = [
  [/electric|bescom|power bill|water bill|\bgas\b|lpg|cylinder|internet|broadband|wifi|airtel|jio|recharge|phone bill/, "UTILITIES"],
  [/uber|ola\b|rapido|fuel|petrol|diesel|transport|freight|tempo|delivery charge|courier|auto fare/, "TRANSPORT"],
  [/repair|plumb|electrician|carpent|maintenance|amc|service charge|painting|pest/, "MAINTENANCE"],
  [/clean|housekeeping|detergent|phenyl|mop|sanitiz|dustbin/, "CLEANING_SUPPLIES"],
  [/utensil|kitchenware|crockery|cutlery|stove|burner|knife/, "KITCHEN_SUPPLIES"],
  [/packag|container|foil|carry bag|parcel|napkin|tissue/, "PACKAGING"],
  [/milk|curd|paneer|dairy|cream|butter/, "DAIRY"],
];

export function guessCategory(description: string): ProductCategory {
  const d = description.toLowerCase();
  for (const [re, cat] of KEYWORDS) if (re.test(d)) return cat;
  return "OTHER";
}

function findCol(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseStatementCsv(text: string): { rows: StatementRow[]; creditsSkipped: number } {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const grid = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));

  const looksLikeHeader = (row: string[]) => {
    const h = row.map((c) => c.toLowerCase());
    return h.some((c) => /date/.test(c)) && h.some((c) => /(narration|description|particulars|details|remarks)/.test(c)) && h.some((c) => /(debit|withdraw|amount|\bdr\b|paid out)/.test(c));
  };
  const headerAt = grid.slice(0, 60).findIndex(looksLikeHeader);
  if (headerAt < 0) {
    throw new Error("Couldn't find the column headings. The CSV needs a Date column, a Description/Narration column, and a Debit (or Amount) column.");
  }

  const headers = grid[headerAt].map((c) => c.toLowerCase());
  const dateIdx = findCol(headers, [/^(transaction|txn|trans)\s*date/, /^date$/, /date/]);
  const descIdx = findCol(headers, [/narration|description|particulars|details|remarks/]);
  const debitIdx = findCol(headers, [/(debit|withdraw|paid out|money out)/, /^dr\.?$/]);
  const creditIdx = findCol(headers, [/(credit|deposit|paid in|money in)/, /^cr\.?$/]);
  const amountIdx = debitIdx >= 0 ? -1 : findCol(headers, [/^(txn |transaction )?amount/]);
  const typeIdx = findCol(headers, [/(dr\s*\/\s*cr|cr\s*\/\s*dr|^type$|txn type|transaction type)/]);
  const refIdx = findCol(headers, [/(ref|chq|cheque|utr|txn id|transaction id|instrument)/]);

  const rows: StatementRow[] = [];
  let creditsSkipped = 0;

  for (const r of grid.slice(headerAt + 1)) {
    const date = parseStatementDate(r[dateIdx] ?? "");
    if (!date) continue; // footers, balance lines, blank separators

    let debit: number | null = null;
    let isCredit = false;
    if (debitIdx >= 0) {
      const d = parseStatementAmount(r[debitIdx]);
      if (d && d > 0) debit = d;
      else {
        const c = creditIdx >= 0 ? parseStatementAmount(r[creditIdx]) : null;
        if (c && c > 0) isCredit = true;
      }
    } else if (amountIdx >= 0) {
      const a = parseStatementAmount(r[amountIdx]);
      if (a !== null && a !== 0) {
        const t = (typeIdx >= 0 ? r[typeIdx] : "").toLowerCase();
        if (/^(cr|credit|c)\b/.test(t)) isCredit = true;
        else if (/^(dr|debit|d)\b/.test(t) || a < 0) debit = Math.abs(a);
        else if (typeIdx >= 0) isCredit = false;
        else debit = a; // no direction column: assume every row is money out
      }
    }

    if (isCredit) creditsSkipped++;
    if (debit === null) continue;

    rows.push({
      date,
      description: (r[descIdx] ?? "").replace(/\s+/g, " ").trim() || "(no description)",
      amount: Math.round(debit * 100) / 100,
      reference: refIdx >= 0 && r[refIdx] ? r[refIdx] : null,
    });
  }

  if (rows.length === 0) {
    throw new Error("No debit (money-out) transactions were found in that file.");
  }
  return { rows, creditsSkipped };
}

const COMPANY_WORDS = new Set(["private", "pvt", "limited", "ltd", "llp", "services", "service", "traders", "trading", "co", "company", "and", "the", "enterprises", "agency", "agencies", "wholesale"]);

function vendorTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !COMPANY_WORDS.has(w));
}

export async function annotateRows(restaurantId: string, rows: StatementRow[]): Promise<AnnotatedRow[]> {
  const dates = rows.map((r) => r.date).sort();
  const from = new Date(`${dates[0]}T00:00:00.000Z`);
  const to = new Date(`${dates[dates.length - 1]}T23:59:59.999Z`);

  const [existing, vendors] = await Promise.all([
    prisma.expense.findMany({ where: { restaurantId, date: { gte: from, lte: to } }, select: { date: true, amount: true, description: true } }),
    prisma.vendor.findMany({ where: { restaurantId }, select: { name: true } }),
  ]);
  const vendorKeys = vendors.map((v) => ({ name: v.name, tokens: vendorTokens(v.name) })).filter((v) => v.tokens.length > 0);

  return rows.map((r) => {
    const dup = existing.find((e) => e.date.toISOString().slice(0, 10) === r.date && Math.abs(e.amount - r.amount) < 0.01);
    const d = r.description.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    const vendor = vendorKeys.find((v) => {
      const key = v.tokens.slice(0, 2).join(" ");
      return v.tokens.length >= 2 ? d.includes(key) : v.tokens[0].length >= 5 && d.includes(v.tokens[0]);
    });
    return {
      ...r,
      category: guessCategory(r.description),
      duplicate: dup ? dup.description : null,
      vendorMatch: vendor ? vendor.name : null,
    };
  });
}

# Restaurant Supply & Expense CRM

A dashboard for tracking restaurant purchases, expenses, inventory, vendors, and
vendor accounts payable — built from monthly bill PDFs. Currently configured for
**Junction 14** — the restaurant name, address, and GSTIN live in **Settings**
(`/settings`), not hardcoded, so this can be re-branded for another restaurant
without touching code.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Prisma 7 + SQLite (local file database, `dev.db`)
- Recharts for charts, `jspdf`/`jspdf-autotable` for PDF reports and receipts,
  `exceljs` for multi-sheet Excel exports, `papaparse` for CSV export
- Claude (Anthropic API) for reading and structuring new bill PDFs

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The database (`dev.db`) is already seeded with 27 invoices from `bills.pdf`
(Oct 2025 – Jul 2026), all from a single vendor, Shanker Lal Suresh Kumar.

## Re-seeding the database

The seed script reads three JSON files transcribed from the source PDF and
loads them via `src/lib/import.ts` (the same import path the in-app PDF
upload uses):

```bash
npm run seed
```

This wipes and rebuilds all tables — only run it if you want to reset to the
original 27-invoice dataset.

## Uploading new months

Go to **Upload Bills** in the sidebar. This calls Claude to read a new PDF
and extract every bill, then lets you review before saving. It requires an
Anthropic API key:

1. Get a key at [console.anthropic.com](https://console.anthropic.com)
2. Add it to `.env`: `ANTHROPIC_API_KEY="sk-ant-..."`
3. Restart the dev server

Without a key, every other part of the app (dashboard, bills, inventory,
vendors, products, analytics, CSV/PDF export, editing records) still works —
only the upload page needs it.

## Notes on the data model

- **Bills are the source of truth.** Expenses and inventory are computed
  from `Bill` + `BillLineItem`, not stored as separate duplicate records —
  so editing a bill's category or a line item automatically updates the
  Expenses and Analytics views.
- **Current stock is inferred from purchases minus returns**, since the
  source bills only record purchases, not kitchen consumption. Treat stock
  values as "what's been bought and not yet returned," not a live physical
  count — use the quick-adjust control on the Inventory page to correct it
  against an actual count.
- **Reorder levels** default to ~25% of a product's first purchase quantity
  so low-stock alerts aren't meaningless from day one — edit them per
  product once you know real consumption patterns.
- **Product categories** are inferred from product names with a keyword
  classifier and are always editable in the Product Catalog — restaurant
  trade names are inconsistent enough that some will need correcting.
- Records extracted with any uncertainty (illegible bill numbers, unclear
  product names) are flagged with a `*` in tables and a banner on their
  detail page.

# Junction 14 — Restaurant CRM

A back-office system for a single restaurant. It tracks what the kitchen **buys**
(vendor bills, inventory, accounts payable), what the restaurant **sells** (daily
sales, menu performance), and what that leaves behind (**profit and loss**).

Live at [restaurant.partywalas.com](https://restaurant.partywalas.com). The
restaurant's name, address and GSTIN live in **Settings**, not in code, so the
same build can be re-branded for another restaurant without edits.

---

## The core idea

Most restaurant tools make you type the same number three times — once as a
purchase, once as stock, once as an expense. Here **a bill is the only thing you
enter**, and everything else is derived from it:

```
Bill + BillLineItem  ──┬──►  Expenses      (grouped by category)
   (source of truth)   ├──►  Inventory     (purchases − returns)
                       ├──►  Product costs (last paid price per item)
                       └──►  Accounts payable (bills − payments)
```

Editing a bill updates every one of those views. There is no separate expense
table to fall out of sync.

The revenue side connects back through **recipes**. A menu item lists the
Products it consumes, so cost of goods is computed from *what was actually sold*
at *real ingredient prices* — not by treating the month's purchases as COGS,
which would swing wildly whenever a bulk order lands.

```
Sales ──► MenuItemSale ──► MenuItem ──► RecipeIngredient ──► Product.lastCostPrice
                                                                    ▲
                                                     set by the bills above ─┘
```

---

## Features

| Area | What it does |
|---|---|
| **Overview** | Monthly dashboard — revenue, operating profit, food cost %, spend, stock value, pending payments, plus generated insights |
| **Sales** | Daily revenue by channel (dine-in / delivery / takeaway) and payment mode; manual entry or PetPooja import |
| **Menu & Recipes** | Menu catalogue with per-dish ingredient recipes, live cost and margin |
| **Profitability (P&L)** | Revenue → COGS → gross profit → labor → other opex → operating profit |
| **Bills & Purchases** | Every invoice and credit note, with line items, all editable |
| **Expenses** | Category breakdown across months |
| **Inventory** | Stock levels, low-stock and out-of-stock alerts, manual adjustment |
| **Vendors** | Vendor list, per-vendor ledger, payment recording, PDF receipts |
| **Balance Sheet** | Stock value against outstanding payables |
| **Upload Bills** | Reads a PDF or photo of bills via OpenAI and extracts every invoice |
| **Users & Access** | Admin-managed accounts (no public sign-up) |

Every screen exports to **CSV**, **Excel** (multi-sheet) and **PDF** on the
restaurant's letterhead.

---

## Quick start

```bash
npm install
npx prisma generate
npm run dev
```

Open <http://localhost:3000>. You will hit a sign-in page — the app is gated.
Create the initial accounts:

```bash
npm run seed:users
```

That prints an `admin` and a `junction14` password once. Change them from
**Settings** after signing in.

### Environment

Create `.env` in the project root:

```ini
DATABASE_URL="file:./dev.db"

# Signs session cookies. Rotating this signs everyone out.
# Generate with: openssl rand -base64 48
SESSION_SECRET="..."

# Only needed for the Upload Bills page. Everything else works without it.
OPENAI_API_KEY=""

# Optional — override the model used to read bills (default: gpt-4.1)
# OPENAI_MODEL="gpt-4.1"
```

---

## Architecture

Next.js 16 App Router. Pages are **React Server Components** that read straight
from the database through the `src/lib` read layer; mutations go through
**server actions**. There is no client-side data-fetching layer and no REST API
for the UI to talk to — route handlers exist only for file downloads and uploads.

```
src/
├── proxy.ts              Route gate — redirects signed-out traffic to /signin
│                         (Next.js 16 renamed middleware.ts → proxy.ts)
├── app/
│   ├── layout.tsx        Shell; renders the sidebar only when signed in
│   ├── page.tsx          Overview dashboard
│   ├── signin/           Sign-in page (the only public route)
│   ├── users/            Admin-only account management
│   ├── sales/ menu/ profitability/ labor/ waste/      Revenue side
│   ├── bills/ expenses/ inventory/ vendors/ products/ Purchase side
│   ├── balance-sheet/ analytics/ settings/ upload/
│   └── api/              Route handlers: exports, uploads, imports
├── lib/
│   ├── prisma.ts         Client singleton (Prisma 7 driver adapter)
│   ├── data.ts           Read model — purchases, vendors, inventory, ledger
│   ├── sales.ts          Read model — sales, menu costing, P&L
│   ├── actions.ts        Server actions — purchase side
│   ├── sales-actions.ts  Server actions — revenue side
│   ├── auth.ts           Session cookies + requireUser/requireAdmin guards
│   ├── auth-actions.ts   Sign-in, sign-out, user administration
│   ├── session.ts        JWT primitives (shared with proxy.ts)
│   ├── password.ts       scrypt hashing (shared with the seed script)
│   ├── import.ts         Extracted bills → database rows
│   ├── openai-extract.ts PDF/photo → structured bills, via OpenAI
│   ├── sales-import.ts   PetPooja export column mapping
│   ├── categories.ts     Product categorisation + food/non-food split
│   ├── excel.ts pdf.ts   Shared export builders
│   └── format.ts         Indian currency, dates, month keys
└── components/           Presentational components + charts
```

### Authorization

Access is enforced in **two layers**, and the second is the one that matters:

1. `src/proxy.ts` checks the session cookie and redirects signed-out requests.
   This is an *optimistic* check — it cannot tell whether the account still
   exists or has been deactivated.
2. `requireUser()` / `requireAdmin()` in pages and server actions, and
   `apiAuthGuard()` in route handlers, re-read the user from the database on
   every request. **This is the real guard.**

The split matters because server actions and route handlers are individually
addressable HTTP endpoints. A new page, action or handler added without one of
those calls is not protected by the proxy alone.

Sessions are signed JWTs in an httpOnly cookie (12-hour expiry). Passwords are
scrypt hashes in the format `scrypt:<salt>:<hash>` — `password.ts` is deliberately
separate from `auth.ts` (which is `server-only`) so the seed script produces
byte-identical hashes to the running app.

---

## Data model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma). The main entities:

**Purchases** — `Vendor`, `Bill`, `BillLineItem`, `Product`, `InventoryMovement`, `Payment`
**Revenue** — `MenuItem`, `RecipeIngredient`, `DailySales`, `MenuItemSale`
**Operations** — `LaborCost`, `WasteEntry`
**System** — `User`, `RestaurantProfile`

### Things worth knowing before you trust a number

- **Stock is inferred from purchases minus returns.** The source bills record
  what was bought, never what the kitchen consumed, so stock means "bought and
  not returned" — not a live physical count. Correct it from the Inventory page.
- **Food cost % only covers dishes that have recipes.** Rather than quietly
  understating cost, the P&L reports what share of revenue its recipe coverage
  accounts for. Low coverage means the number is provisional.
- **Product categories are guessed** from trade names by a keyword classifier
  (`inferCategory`). Restaurant naming is inconsistent enough that some will be
  wrong; every category stays editable in the Product Catalog.
- **Reorder levels default to ~25%** of a product's first purchase quantity, so
  alerts are meaningful on day one. Tune them once real consumption is known.
- **Uncertain extractions are flagged** with a `*` in tables and a banner on the
  record, rather than being silently accepted.
- **Non-food purchases become operating expenses**; food purchases do not, since
  ingredient cost already reaches the P&L through recipes. `NON_FOOD_CATEGORIES`
  is derived from `FOOD_CATEGORIES` so a category added later cannot fall
  through the gap between the two lists.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run seed:users` | Create the initial admin / junction14 accounts (re-runnable; never overwrites an existing password) |

The original 27 invoices were loaded once via the same `src/lib/import.ts` path
the upload flow uses, and now live in `dev.db`. There is no re-seed script for
purchase data — new bills come in through **Upload Bills**.

---

## Deployment

Runs on AWS EC2 under PM2, behind Nginx with a Let's Encrypt certificate.
Deploys are rsync-based — the server has no git access.

```bash
rsync -az --delete -e "ssh -i ~/.ssh/restaurantcrm_deploy" \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude 'dev.db*' \
  ./ ubuntu@<host>:/var/www/restaurantcrm/
```

Then on the server: `npm install`, `npx prisma generate`, `npx prisma db push`,
`npm run build`, `pm2 restart restaurantcrm`.

> **Always exclude `.env` and `dev.db*`.** The production database is the only
> copy of the real business records, and the server has its own `SESSION_SECRET`.
> A careless sync overwrites both.

Back up `dev.db` on the server before any schema change.

---

## Current limitations

- **Single tenant.** Users are logins, not separate restaurants — everyone with
  an account sees the same data. Supporting a second restaurant means adding a
  tenant column and scoping every query, not flipping a setting.
- **SQLite on one machine.** Fine at this size; it is the constraint to revisit
  before scaling out, since it rules out multiple app instances.
- **Sign-in throttling is in-memory**, so it resets when the process restarts.
  Adequate for one PM2 process; not for a multi-instance deployment.

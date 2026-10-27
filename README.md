# Partywalas — Multi-Tenant Restaurant CRM

A back-office system for restaurants. It tracks what a kitchen **buys**
(vendor bills, inventory, accounts payable), what it **sells** (daily
sales, menu performance), and what that leaves behind (**profit and loss**).

Partywalas is the platform; each restaurant that gets CRM access — starting
with Junction 14 — is a **tenant** with its own team and its own isolated data.
A Partywalas platform admin (`SUPER_ADMIN`) creates restaurant accounts from
**Platform → Restaurants** but never sees a restaurant's business data; each
restaurant's own `RESTAURANT_ADMIN` manages its team and profile (name,
address, GSTIN) from **Settings**.

Live at [restaurant.partywalas.com](https://restaurant.partywalas.com).

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
| **Upload Bills** | Reads a PDF or photo of bills via OpenAI, re-checks the arithmetic, and shows everything for editing and approval before saving |
| **Add Bill** | Enter a bill by hand (vendor name plus any number of item rows) when there's no document to scan; also reachable from the Import page |
| **Cash Expenses** | Record cash/UPI/bank spend that isn't a vendor bill (rent, repairs, tips, petty cash), each with a category, who it was paid to, a description and an explanation. Owner-only edit/delete |
| **Bank / UPI Statement Import** (Owner) | Upload a bank statement as CSV, PDF or photo (PDF/photo read via OpenAI). Rows are previewed with a suggested category; vendor payments and rows already imported are auto-unticked; the whole import can be undone |
| **Cash Book** | One register of all cash movement: cash sales and manual cash receipts in, cash expenses and cash vendor payments out, with opening, running and closing balance. Filters by dates, direction, type, party, amount and text; exports to CSV |
| **Product Ledger** | One product's full history across dates: purchases, returns, kitchen usage, stock counts and waste, with vendor, rate, amount, running stock and a purchases-by-month table. With no product chosen it shows a summary of every product |
| **Menu + Recipe Builder** | Create a dish and its recipe in one step; ingredients are picked from existing products or created inline, with live cost and margin. Recipes drive consumption tracking |
| **Consumption** | Per product: bought (bills) vs used (staff-logged) vs wasted vs what recipes expect, plus physical stock counts; flags over-use and missing stock, shows price history and days of stock left |
| **Users & Access** | Restaurant-admin-managed accounts, scoped to that restaurant (no public sign-up) |
| **Platform → Restaurants** (SUPER_ADMIN only) | Create restaurants, assign their first admin, activate/deactivate — no business data visible here |

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

That prints a single `admin` (`SUPER_ADMIN`, Partywalas platform admin)
password once — change it from **Settings** after signing in. Restaurant
accounts (`RESTAURANT_ADMIN`, e.g. `junction14`) are created from that
admin's **Platform → Restaurants** page, which creates the restaurant and
its first admin together.

### Environment

Create `.env` in the project root:

```ini
DATABASE_URL="file:./dev.db"

# Signs session cookies. Rotating this signs everyone out.
# Generate with: openssl rand -base64 48
SESSION_SECRET="..."

# Needed for Upload Bills and for PDF/photo bank statements.
# CSV statements and everything else work without it.
OPENAI_API_KEY=""

# Optional — override the model used to read bills (default: gpt-5.5)
# OPENAI_MODEL="gpt-5.5"
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
│   ├── page.tsx          Overview dashboard (restaurant users only)
│   ├── signin/           Sign-in page (the only public route)
│   ├── platform/         SUPER_ADMIN-only: create/manage restaurants
│   ├── users/            Restaurant-admin-only account management
│   ├── sales/ menu/ profitability/ labor/ waste/      Revenue side
│   ├── bills/ expenses/ inventory/ vendors/ products/ Purchase side
│   ├── expenses/cash/    Cash expenses + bank/UPI statement import
│   ├── cash/ ledger/     Cash Book and per-product Product Ledger
│   ├── consumption/ guests/ import/
│   ├── balance-sheet/ analytics/ settings/ upload/
│   └── api/              Route handlers: exports, uploads, imports
├── lib/
│   ├── prisma.ts         Client singleton (Prisma 7 driver adapter)
│   ├── data.ts           Read model — purchases, vendors, inventory, ledger
│   ├── sales.ts          Read model — sales, menu costing, P&L
│   ├── actions.ts        Server actions — purchase side
│   ├── sales-actions.ts  Server actions — revenue side (incl. menu + recipe builder)
│   ├── expenses.ts       Read model — cash expenses and statement imports
│   ├── expense-actions.ts Server actions — create (staff), edit/delete/undo (owner)
│   ├── statement.ts      Bank/UPI statement parsing, category guess, duplicate flags
│   ├── openai-statement.ts PDF/photo statement → rows, via OpenAI
│   ├── cashbook.ts       Read model — Cash Book (union of four cash sources)
│   ├── cash-actions.ts   Server actions — manual cash receipts
│   ├── ledger.ts         Read model — Product Ledger and per-product summary
│   ├── consumption.ts    Read model — consumption overview and per-product detail
│   ├── auth.ts           Session cookies; requireUser/requireRestaurantUser/
│   │                     requireRestaurantAdmin/requireSuperAdmin guards
│   ├── auth-actions.ts   Sign-in, sign-out, user administration, restaurant
│   │                     creation (platform)
│   ├── session.ts        JWT primitives (shared with proxy.ts)
│   ├── password.ts       scrypt hashing (shared with the seed script)
│   ├── import.ts         Extracted bills → database rows
│   ├── bill-check.ts     Arithmetic verification (shared server + browser)
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
2. `requireUser()` / `requireRestaurantUser()` / `requireRestaurantAdmin()` /
   `requireSuperAdmin()` in pages and server actions, and `apiAuthGuard()` /
   `apiRestaurantGuard()` in route handlers, re-read the user from the
   database on every request. **This is the real guard.**

The split matters because server actions and route handlers are individually
addressable HTTP endpoints. A new page, action or handler added without one of
those calls is not protected by the proxy alone.

**Owner vs Staff.** Inside a restaurant there are two roles (stored as
`RESTAURANT_ADMIN` and `USER`, shown as **Owner** and **Staff**). Staff can only
*add* — upload or enter bills, add vendors/products, record payments, log
guests, log usage and stock counts. Anything that changes or removes an
existing record (edit/delete a bill, bill line, vendor, product, payment, sales
day, recipe, guest, usage entry, stock count) is Owner-only via
`requireRestaurantAdmin()`, and every correction reverses its effect on stock
and is written to the Activity Log. Staff also cannot open the P&L, Balance
Sheet, Analytics, Labor Cost, Users or Activity Log pages (they land on Bills).
`src/lib/roles.ts` holds the labels and `isOwner()`.

**Tenant isolation is enforced the same way, one layer deeper.**
`requireRestaurantUser()` returns a `restaurantId` that is non-nullable *at
the type level* — a `SUPER_ADMIN` (whose `restaurantId` is always `null`)
cannot satisfy that return type, so it is structurally impossible for
platform-admin code to call a restaurant-scoped data function. Every business
table carries a `restaurantId`, every read in `src/lib/data.ts` and
`src/lib/sales.ts` takes it as its first parameter and filters by it, and
every update/delete server action re-checks `findFirst({ id, restaurantId })`
before mutating rather than trusting a client-supplied id.

Sessions are signed JWTs in an httpOnly cookie (12-hour expiry). Passwords are
scrypt hashes in the format `scrypt:<salt>:<hash>` — `password.ts` is deliberately
separate from `auth.ts` (which is `server-only`) so the seed script produces
byte-identical hashes to the running app.

---

## Data model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma). The main entities:

**Tenant** — `Restaurant` (name, address, GSTIN, `isActive`)
**Purchases** — `Vendor`, `Bill`, `BillLineItem`, `Product`, `InventoryMovement`, `Payment`
**Cash & Expenses** — `Expense`, `ExpenseStatement`, `CashReceipt`
**Revenue** — `MenuItem`, `RecipeIngredient`, `DailySales`, `MenuItemSale`
**Operations** — `LaborCost`, `WasteEntry`, `StockCount`
**System** — `User`, `ActivityLog`

`Vendor`, `Product`, `Bill`, `MenuItem`, `DailySales`, `LaborCost`,
`WasteEntry`, `Expense`, `ExpenseStatement` and `CashReceipt` each carry a required `restaurantId`. `Payment`, `BillLineItem`,
`InventoryMovement`, `RecipeIngredient` and `MenuItemSale` deliberately don't
duplicate it — they're scoped through their parent relation (e.g.
`bill: { restaurantId }`) so there's no second copy of the tenant id to drift.
`User.restaurantId` is nullable — `null` only for a `SUPER_ADMIN`.

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
- **Every extracted bill is re-checked arithmetically** before you see it
  (`checkBill` in `src/lib/bill-check.ts`): line items must sum to the subtotal,
  subtotal plus tax must equal the grand total, and each row's quantity × rate
  must equal its amount. Reading a bill is fallible — a smudged digit becomes a
  wrong number in the books — so the totals are re-derived rather than trusted,
  and nothing saves until a human ticks the confirmation. Every figure on the
  review screen is editable — the person holding the paper bill is the
  authority — and the warnings recompute as you type, so a correction visibly
  clears the flag. `bill-check.ts` is free of Prisma precisely so the same rules
  run server-side and in the browser.
- **Vendors are matched case-insensitively.** The same supplier arriving as
  "SHANKER LAL SURESH KUMAR" on one bill and "Shanker Lal Suresh Kumar" on
  another would otherwise open two accounts and split the ledger.
  `npm run merge-vendors` repairs records already split that way.
- **The Cash Book only knows what was recorded.** Its opening balance is the net
  of every recorded entry before the start date, not a counted figure. Cash IN is
  the cash column of Daily Sales plus manual cash receipts; cash OUT is cash
  expenses plus vendor payments made in cash. UPI/bank expenses are excluded. A
  missing sales day or receipt makes the balance wrong by exactly that amount.
- **Cash expenses reduce profit; bills for food do not double count.** Recorded
  expenses flow into the P&L as operating expense (`getOperatingExpenseTotal`).
  Statement rows that are payments to a known vendor are flagged and unticked so
  a bill already in the system is not counted twice.
- **The Product Ledger's running stock is anchored to today.** It is worked
  backwards from the product's current stock, so the last row always matches the
  stock shown elsewhere. Waste rows are shown as memo lines because waste does
  not change stock in this app.
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
| `npm run seed:users` | Create the initial Partywalas `admin` (`SUPER_ADMIN`) account (re-runnable; never overwrites an existing password) |
| `npm run merge-vendors` | Report duplicate vendor records; `-- --apply` merges them |

The original 27 invoices were loaded once via the same `src/lib/import.ts` path
the upload flow uses, and now live in `dev.db`. There is no re-seed script for
purchase data — new bills come in through **Upload Bills**.

---

## Deployment

Runs on an AWS Lightsail instance (Ubuntu, Node 22, 2 GB swap) under PM2,
behind Nginx with a Let's Encrypt certificate; a systemd timer
(`restaurantcrm-backup.service`) snapshots `dev.db` to `/var/backups/restaurantcrm`.
Deploys are rsync-based — the server has no git access.

```bash
rsync -az --delete -e "ssh -4 -i ~/.ssh/id_ed25519" \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude 'dev.db*' \
  ./ ubuntu@<host>:/var/www/restaurantcrm/
```

Then on the server: `npm install`, `npx prisma generate`, `npx prisma db push`,
`npm run build`, `pm2 restart restaurantcrm`.

> **Always exclude `.env` and `dev.db*`.** The production database is the only
> copy of the real business records, and the server has its own `SESSION_SECRET`.
> A careless sync overwrites both.

Back up `dev.db` on the server before any schema change
(`sudo systemctl start restaurantcrm-backup.service`). The Cash Expenses, Cash
Book and statement-import features added the `Expense`, `ExpenseStatement` and
`CashReceipt` tables; all schema changes so far have been additive.

---

## Current limitations

- **SQLite on one machine.** Fine at this size; it is the constraint to revisit
  before scaling out, since it rules out multiple app instances.
- **Sign-in throttling is in-memory**, so it resets when the process restarts.
  Adequate for one PM2 process; not for a multi-instance deployment.

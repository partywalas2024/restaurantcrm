# Product Requirements Document — Partywalas Restaurant CRM

**Status:** Live in production at [restaurant.partywalas.com](https://restaurant.partywalas.com)
**Last updated:** reflects the multi-tenant rebuild (Partywalas platform + Junction 14 as its first restaurant)

---

## 1. Purpose

A back-office system for restaurants that replaces manual bill-tracking with one system of record per restaurant. It answers three questions an owner needs answered every month:

1. What did we spend, on what, with whom? (Purchases)
2. What did we sell, and at what margin? (Sales & Menu)
3. Did we make money? (Profit & Loss)

The guiding principle: **a bill is entered once** — either scanned or typed — and every other view (expenses, inventory, payables, cost-of-goods) is derived from it. There is no separate data-entry step for expenses or stock.

Partywalas is the platform. Each restaurant given CRM access is a **tenant**
with its own team and its own isolated data — Junction 14 is the first.

## 2. Users

Three roles:

- **SUPER_ADMIN** (Partywalas platform admin, currently: `admin`) — creates and
  activates/deactivates restaurant accounts from **Platform → Restaurants**.
  Deliberately **cannot** see any restaurant's business data — `restaurantId`
  is `null` on this role and every business-data function requires a non-null
  one, so this is a structural guarantee, not a policy.
- **RESTAURANT_ADMIN (Owner)** — full access to their own restaurant's data, plus user
  management for that restaurant (create/deactivate/delete accounts, reset
  passwords). The only role that can edit or delete existing records (duplicate or
  wrong bills, lines, vendors, products, payments, usage/count entries).
  Currently: `junction14`.
- **USER (Staff)** — can add and upload (bills, vendors, products, payments, guests,
  usage, stock counts) but cannot edit or delete anything, and cannot see P&L,
  Balance Sheet, Analytics, Labor Cost, Users or Activity Log.

No public sign-up. Accounts are created by the admin one level up (Partywalas
admin creates restaurant admins; restaurant admins create their own team).
Every business table is scoped by `restaurantId`; a user from one restaurant
can never see or reach another restaurant's data — enforced by query scoping
plus a per-row ownership check on every mutation, not just by what the UI
shows.

## 3. Core Domain Model

```
Bill + BillLineItem  ──┬──►  Expenses      (grouped by category)
   (source of truth)   ├──►  Inventory     (purchases − returns)
                        ├──►  Product costs (last paid price per item)
                        └──►  Accounts payable (bills − payments)

Sales ──► MenuItemSale ──► MenuItem ──► RecipeIngredient ──► Product.lastCostPrice
                                                                   ▲
                                                    same purchase data above ─┘
```

Purchases and sales are two independent data feeds that meet at the P&L through recipes: a menu item's cost is computed from its recipe's ingredients at their last purchased price, not from raw monthly purchase totals. This means food-cost % is only as good as recipe coverage — the app reports coverage explicitly rather than pretending it's complete.

## 4. Functional Requirements

### 4.1 Purchases & Supply

| Requirement | Status |
|---|---|
| Record vendor bills (invoice or return) with line items, tax, totals | ✅ Live |
| Extract bills automatically from PDF or photo (OpenAI, gpt-5.5) | ✅ Live |
| Manually enter a bill with no source document | ✅ Live |
| Verify extracted figures arithmetically before saving (line items vs. subtotal, subtotal+tax vs. grand total, qty×rate vs. amount) | ✅ Live |
| Edit any extracted figure before approval | ✅ Live |
| Vendor de-duplication (case-insensitive matching) | ✅ Live |
| Inventory levels inferred from purchases − returns | ✅ Live |
| Manual stock adjustment against physical count | ✅ Live |
| Low-stock / out-of-stock alerts | ✅ Live |
| Product categorization (auto-guessed, always editable) | ✅ Live |
| Vendor ledger (bills as debits, payments as credits, running balance) | ✅ Live |
| Record payments to vendors, generate PDF receipt | ✅ Live |
| Balance sheet (stock value vs. payables) | ✅ Live |

### 4.2 Sales & Growth

| Requirement | Status |
|---|---|
| Record daily sales by channel (dine-in / delivery / takeaway / other) and payment mode | ✅ Live |
| Import sales from a PetPooja POS export | ✅ Live |
| Menu catalogue with per-dish recipes | ✅ Live |
| Recipe-based food cost and margin per dish | ✅ Live |
| Top-seller and lowest-margin rankings | ✅ Live |
| Revenue trend, revenue by channel | ✅ Live |
| Day-of-week sales pattern | ✅ Live |
| Next-month trend projection (revenue, purchase spend) | ✅ Live — explicitly labeled as linear extrapolation, not a forecast |
| Labor cost tracking by category | ✅ Live |
| Waste/spoilage tracking | ✅ Live |
| Profit & Loss statement (revenue → COGS → gross profit → labor → opex → operating profit) | ✅ Live |

### 4.3 Reporting & Export

| Requirement | Status |
|---|---|
| CSV export per section | ✅ Live |
| Multi-sheet Excel export per section | ✅ Live |
| PDF reports on restaurant letterhead | ✅ Live |
| Vendor ledger export (CSV/Excel/PDF) | ✅ Live |
| Payment receipts (PDF) | ✅ Live |

### 4.4 Access & Security

| Requirement | Status |
|---|---|
| Sign-in required for every route | ✅ Live |
| Admin-managed accounts, no self-registration | ✅ Live |
| Session cookie, signed, 12-hour expiry | ✅ Live |
| Passwords hashed (scrypt), never stored plain | ✅ Live |
| Sign-in throttling after repeated failures | ✅ Live (in-memory — resets on restart, see Known Limitations) |
| Two-layer authorization (route gate + per-action guard) | ✅ Live |

### 4.5 Configuration

| Requirement | Status |
|---|---|
| Restaurant profile (name, address, GSTIN) drives branding across the app, editable by that restaurant's admin | ✅ Live |
| OpenAI model configurable via env var | ✅ Live |

### 4.5b Consumption tracking

| Requirement | Status |
|---|---|
| Per-product monthly view: bought, spend, avg rate, logged usage, waste, recipe-expected usage, count variance | ✅ Live |
| Staff log usage (reduces stock) and record physical stock counts (variance kept) | ✅ Live |
| Owner can delete a wrong usage entry or count; stock is reversed | ✅ Live |
| Flags: stock missing, over recipe, usage not logged; days-of-stock-left with stated basis | ✅ Live |
| Purchase price history and swing per product | ✅ Live |

### 4.6 Platform (Partywalas)

| Requirement | Status |
|---|---|
| SUPER_ADMIN can create a restaurant + its first RESTAURANT_ADMIN together | ✅ Live |
| SUPER_ADMIN can activate/deactivate a restaurant | ✅ Live |
| SUPER_ADMIN sees account/restaurant metadata only, never business data | ✅ Live — structural, not just UI (see §2) |
| Restaurant-scoped data isolation across every table and query | ✅ Live |

## 5. Non-Functional Requirements

- **Data integrity over automation.** Every AI-extracted figure is shown for human review before it is saved. Nothing from OpenAI reaches the database unreviewed.
- **No silent data loss.** Vendor matching, merges, and imports are additive; a merge tool exists specifically because an earlier version of vendor matching split one supplier's ledger across two records.
- **Every number must be traceable to a source document or a manual entry** — no fabricated or interpolated business data (see explicit refusal to build customer analytics in §8).

## 6. Out of Scope (by design, not oversight)

- **Customer-level analysis** (repeat visits, customer lifetime value, loyalty). No customer identity exists anywhere in the data — sales are recorded per-day, not per-order or per-customer, and the PetPooja import carries no customer field. Building this would mean fabricating data. Would require a schema and POS-integration change first (see Audit).
- **Real statistical forecasting.** The "projection" feature is a labeled linear trend line over available months, not a demand-forecasting model.
- **Reservations, table management, POS/order-taking.** This is a back-office analysis tool, not a POS.

## 7. Current Data (production, as of this writing)

Pre-migration figures (single-restaurant era, now Junction 14's tenant data):
31 bills, 4 vendors. See `docs/AUDIT.md` for the currently-open data issues
inherited by Junction 14's tenant.

## 8. Known Gaps / Next Priorities

See `docs/AUDIT.md` for the full feature audit. Highest-priority open items:

1. **Correct the 2 flagged legacy bills** (A001579, A000886) — data fix, not code, needs the paper originals.
2. **Rotate the OpenAI API key** — pasted into chat during setup, should be treated as compromised.
3. **SQLite → networked database** — acceptable at current scale; blocks running more than one app instance.

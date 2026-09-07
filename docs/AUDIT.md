# Feature Audit — Junction 14 Restaurant CRM

Snapshot of every feature that exists, its actual state (not aspirational), and what's missing — ranked by how much it matters. Based on direct inspection of the codebase and production database, not the README's framing of itself.

---

## Part A — What Exists (verified against code + production data)

### A1. Purchases & Supply

| Feature | State | Notes |
|---|---|---|
| Bill entry (invoice/return) | ✅ Working | 31 bills in production |
| PDF/photo bill extraction (OpenAI) | ✅ Working | Verified end-to-end: PDF and JPG both exact-match on a test invoice; model is `gpt-5.5` |
| Arithmetic verification of extracted bills | ✅ Working | Catches misreads before save; handles both pre-tax and tax-inclusive bill layouts |
| Manual bill entry | ✅ Working | Same downstream path as scanned bills — no second code path to drift |
| Editable review-before-save | ✅ Working | Every field editable; warnings recompute live |
| Vendor management | ✅ Working, one known past bug (fixed) | Case-insensitive matching added after a duplicate-vendor incident; `npm run merge-vendors` exists for future duplicates |
| Inventory (purchases − returns) | ✅ Working | Explicitly *not* a physical stock count — see Part B |
| Product categorization | ✅ Working | Keyword-guessed, editable; classifier had at least 2 confirmed misses found in testing (toor dal, paneer) and fixed |
| Vendor ledger + PDF/CSV/Excel export | ✅ Working | |
| Payment recording + PDF receipts | ✅ Working | |
| Balance sheet | ✅ Working | |

### A2. Sales & Growth

| Feature | State | Notes |
|---|---|---|
| Daily sales entry (manual) | ✅ Working | |
| PetPooja report sync (Orders Master / Executive Summary / Day End) | ✅ Working | Verified against 3 real exports; found and fixed 2 real bugs in the process (a PhonePe spelling variant, a tax-basis mismatch) |
| PetPooja item-wise CSV import | ⚠️ Built, lightly tested | Column-mapping logic validated against a hand-authored synthetic CSV only — never run against a real export |
| Menu & recipe costing | ✅ Working | Verified: manual math cross-checks matched exactly |
| Top sellers / lowest margin | ✅ Working | |
| Revenue trend, channel split | ✅ Working | |
| Day-of-week pattern | ✅ Working | Real data (`DailySales.date`), no fabrication |
| Next-month projection | ✅ Working | Linear regression, labeled as indicative only — not a real forecast |
| Labor cost tracking | ✅ Working | |
| Waste tracking | ✅ Working | |
| Profit & Loss | ✅ Working | Food-cost % explicitly caveated by recipe coverage |

### A3. Access & Security

| Feature | State | Notes |
|---|---|---|
| Sign-in gate (all routes) | ✅ Working | Two-layer: `proxy.ts` (optimistic) + `requireUser()`/`requireAdmin()`/`apiAuthGuard()` (authoritative) |
| Admin user management | ✅ Working | Guards against removing the last admin |
| Password hashing (scrypt) | ✅ Working | |
| Session cookies (signed JWT, 12h) | ✅ Working | |
| Sign-in throttling | ⚠️ Working, fragile | In-memory — resets on process restart; fine for one PM2 instance, not for scale |

### A4. Reporting

| Feature | State | Notes |
|---|---|---|
| CSV / Excel / PDF export | ✅ Working | Every major section, including new sales analytics sheets |
| Restaurant-branded letterhead | ✅ Working | Data-driven, not hardcoded |

---

## Part B — Known Data Issues (Real, Currently Open)

| Issue | Severity | Detail |
|---|---|---|
| 2 bills fail arithmetic reconciliation | 🔴 Needs manual fix | `A001579` (OYA AGENCIES) — line items exceed subtotal by ~₹6,647, total off by ₹1,000. `A000886` (Shanker Lal) — line items exceed subtotal by ~₹8,230, has a duplicate "SALT 30" line. Both predate the verification feature. Not auto-corrected — would mean guessing at financial figures. |
| API key exposure | 🔴 Security | An OpenAI key was pasted directly into chat during setup. Should be rotated; treat the pasted value as compromised regardless of whether it's still in `.env`. |
| Inventory ≠ physical stock | 🟡 By design, must stay understood | Inferred from purchases minus returns only — kitchen consumption isn't tracked, so "current stock" drifts from reality over time without periodic manual correction. |

---

## Part C — Missing Features, Ranked

### 🔴 High priority — real business risk if ignored

1. **Multi-restaurant / tenant isolation.** Every user currently sees every bit of data — there is no concept of "this data belongs to restaurant X." If this tool is ever shared beyond Junction 14, this is a hard requirement, not a nice-to-have, and it's a schema-level change (tenant ID on every table + query scoping), not a toggle.
2. **Correct the 2 flagged bills.** Financial records currently contain known-wrong figures. Low effort, needs the paper originals and 10 minutes in the Bills UI.
3. **Networked database.** SQLite on one machine is fine today. It is the reason this can't run more than one app instance, and it's a single point of failure with no built-in replication. Worth planning before this becomes business-critical infrastructure the owner can't afford downtime on.
4. ~~**Automated backups.**~~ **Done.** `scripts/backup-db.mjs` + a systemd timer (`deploy/restaurantcrm-backup.timer`) take a verified online SQLite backup daily to `/var/backups/restaurantcrm` (outside the app directory, with 14-day rotation), installed and running on production. Restore path tested (a real backup was loaded and its data read back). Remaining gap: same-instance only — true off-site backup needs an S3 bucket or a scheduled pull to another machine, neither provisioned (see note below).

### 🟡 Medium priority — real gaps, no urgent trigger yet

5. ~~**PetPooja import, tested against a real export.**~~ **Done** — see the report-sync feature (Orders Master / Executive Summary / Day End), verified against three real exports and now live.
6. ~~**Audit trail / activity log.**~~ **Done.** `ActivityLog` model + `/activity` (admin-only) covers bills, products, vendors, payments, stock adjustments, restaurant profile, manual bill entry, user management, and every import path (bill scans, PetPooja reports, item-wise CSV). Verified live: create/delete a payment, confirmed both log entries with correct attribution.
7. ~~**Rate limiting on the extraction endpoint.**~~ **Done.** 30 calls/hour per user on `/api/extract`, in-memory (same trade-off as the sign-in throttle — fine for one PM2 process). Unit-verified: allows exactly the limit, blocks the next call, resets after the window, doesn't cross-contaminate between users.
8. **Session throttling that survives a restart.** Currently in-memory; a PM2 restart clears failed-login counters. Low risk at 2 users, real gap at scale.
9. ~~**Recipe coverage completeness.**~~ **Done.** Menu page now shows "N of M active menu items have no recipe" up front, rather than only surfacing after landing on a specific month's P&L.

### 🟢 Lower priority — genuinely deferred, correctly so

10. **Customer-level analysis.** Explicitly not built — no customer identity exists in the data model (see PRD §6). Building this without a real data source would mean inventing numbers. Only worth doing if/when PetPooja or another POS integration can supply real customer/order identity.
11. **Real forecasting.** Current "projection" is intentionally simple (linear trend) and labeled as such. A genuine forecasting model would need much more sales history than currently exists (a handful of months) to be worth building — more data first, better model later.
12. **Reservations / table management / order-taking.** Out of scope for a back-office analysis tool; would turn this into a different product (a POS).

---

## How to use this file

- Part A is a status check — re-verify against the running app before assuming any row still holds, especially "Working" rows for features not touched recently.
- Part B is the action list for this week.
- Part C, items 1–4, is the conversation to have before this tool takes on more business weight (a second location, more users, or being treated as the sole record of the restaurant's finances).

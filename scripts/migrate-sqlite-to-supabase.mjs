/**
 * Copy all business data from a Lightsail SQLite file into Supabase Postgres.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-supabase.mjs --sqlite ./production-dev.db
 *
 * Requires DATABASE_URL / DIRECT_URL in .env (Supabase).
 * Wipes existing rows in matching Postgres tables, then inserts SQLite rows.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);

function loadSqlite() {
  try {
    return require("better-sqlite3");
  } catch {
    // Fallback to the copy nested under the Prisma adapter if root build failed.
    return require(
      path.resolve(
        "node_modules/@prisma/adapter-better-sqlite3/node_modules/better-sqlite3",
      ),
    );
  }
}

const Database = loadSqlite();

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Parent tables before children (FK-safe).
const TABLE_ORDER = [
  "Restaurant",
  "User",
  "Vendor",
  "Product",
  "MenuItem",
  "DailySales",
  "LaborCost",
  "WasteEntry",
  "Customer",
  "StockCount",
  "ExpenseStatement",
  "Expense",
  "CashReceipt",
  "ActivityLog",
  "Bill",
  "Payment",
  "RecipeIngredient",
  "MenuItemSale",
  "CustomerVisit",
  "BillLineItem",
  "InventoryMovement",
];

const sqlitePath = path.resolve(arg("sqlite", "./production-dev.db"));
const pgUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!pgUrl) {
  console.error("FAIL: DATABASE_URL / DIRECT_URL missing in .env");
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const sqliteTables = new Set(
  sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((r) => r.name),
);

const client = new pg.Client({
  connectionString: pgUrl,
  connectionTimeoutMillis: 30000,
});

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function normalizeValue(v) {
  if (typeof v === "bigint") return Number(v);
  return v;
}

async function main() {
  console.log(`SQLite source: ${sqlitePath}`);
  await client.connect();
  console.log("Connected to Supabase");

  // Disable FK checks for the session while we wipe + reload.
  await client.query("SET session_replication_role = replica");

  const present = TABLE_ORDER.filter((t) => sqliteTables.has(t));
  const missing = TABLE_ORDER.filter((t) => !sqliteTables.has(t));
  if (missing.length) {
    console.log(`Skipping tables not in SQLite: ${missing.join(", ")}`);
  }

  // Wipe Postgres tables in reverse FK order.
  for (const table of [...present].reverse()) {
    await client.query(`TRUNCATE TABLE ${quoteIdent(table)} CASCADE`);
    console.log(`truncated ${table}`);
  }

  let total = 0;
  for (const table of present) {
    const rows = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
    if (rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    const colList = cols.map(quoteIdent).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`;

    let inserted = 0;
    for (const row of rows) {
      const values = cols.map((c) => normalizeValue(row[c]));
      try {
        await client.query(sql, values);
        inserted += 1;
      } catch (e) {
        console.error(`FAIL inserting into ${table}:`, e.message);
        console.error("Row id/keys:", row.id ?? cols.slice(0, 3).map((c) => `${c}=${row[c]}`).join(", "));
        throw e;
      }
    }
    total += inserted;
    console.log(`${table}: ${inserted} rows`);
  }

  await client.query("SET session_replication_role = DEFAULT");
  console.log(`\nDone. Imported ${total} rows into Supabase.`);
  await client.end();
  sqlite.close();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await client.end();
  } catch {
    // ignore
  }
  try {
    sqlite.close();
  } catch {
    // ignore
  }
  process.exit(1);
});

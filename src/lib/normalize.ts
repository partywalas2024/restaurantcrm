// Bills are handwritten/typed trade names, not a fixed SKU list, so the same
// product often appears with slightly different spelling across invoices.
// This does light, conservative cleanup only — it never merges two
// genuinely different products, since over-normalizing silently corrupts
// purchase history. Everything stays editable in the Product Catalog.
const TYPO_FIXES: [RegExp, string][] = [
  [/\bDAAL\b/g, "DAL"],
  [/\bPEPER\b/g, "PEPPER"],
  [/\bCUSTERED\b/g, "CUSTARD"],
  [/\bCHOTE\b/g, "CHHOTE"],
  [/\bCHOCLATE\b/g, "CHOCOLATE"],
  [/\bSTRACH\b/g, "STARCH"],
  [/\bMAAZE\b/g, "MAIZE"],
  [/\bTHOUSAND\b/g, "1000 ISLAND"],
];

export function normalizeProductName(raw: string): string {
  let name = raw.trim().toUpperCase().replace(/\s+/g, " ");
  for (const [pattern, replacement] of TYPO_FIXES) {
    name = name.replace(pattern, replacement);
  }
  return name;
}

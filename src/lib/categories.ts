import { ProductCategory } from "@/generated/prisma/enums";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  RAW_MATERIALS: "Raw Materials",
  GRAINS_FLOURS: "Grains & Flours",
  PULSES_DALS: "Pulses & Dals",
  SPICES_MASALAS: "Spices & Masalas",
  OILS_GHEE: "Oils & Ghee",
  DAIRY: "Dairy",
  CONDIMENTS_SAUCES: "Condiments & Sauces",
  SNACKS_NAMKEEN: "Snacks & Namkeen",
  BEVERAGES: "Beverages",
  PACKAGING: "Packaging",
  CLEANING_SUPPLIES: "Cleaning Supplies",
  KITCHEN_SUPPLIES: "Kitchen Supplies",
  UTILITIES: "Utilities",
  TRANSPORT: "Transport",
  MAINTENANCE: "Maintenance",
  OTHER: "Other / Groceries",
};

// Food-ingredient categories feed theoretical COGS on the P&L via recipe
// costing; everything else counts as "other operating expense". Splitting this
// way avoids double-counting — ingredient cost reaches the P&L through what was
// actually sold, not through raw purchase totals.
const FOOD_CATEGORIES: ProductCategory[] = [
  "RAW_MATERIALS",
  "GRAINS_FLOURS",
  "PULSES_DALS",
  "SPICES_MASALAS",
  "OILS_GHEE",
  "DAIRY",
  "CONDIMENTS_SAUCES",
  "SNACKS_NAMKEEN",
  "BEVERAGES",
];

// Derived rather than hand-listed: a new ProductCategory added to the schema
// then defaults to non-food and shows up in operating expenses, instead of
// falling through both lists and silently vanishing from the P&L.
export const NON_FOOD_CATEGORIES: ProductCategory[] = (
  Object.keys(CATEGORY_LABELS) as ProductCategory[]
).filter((category) => !FOOD_CATEGORIES.includes(category));

// Deterministic color per category, reused for charts + badges everywhere.
export const CATEGORY_COLORS: Record<ProductCategory, string> = {
  RAW_MATERIALS: "#b4451f",
  GRAINS_FLOURS: "#d97706",
  PULSES_DALS: "#65a30d",
  SPICES_MASALAS: "#dc2626",
  OILS_GHEE: "#ca8a04",
  DAIRY: "#0891b2",
  CONDIMENTS_SAUCES: "#c026d3",
  SNACKS_NAMKEEN: "#ea580c",
  BEVERAGES: "#2563eb",
  PACKAGING: "#6366f1",
  CLEANING_SUPPLIES: "#0d9488",
  KITCHEN_SUPPLIES: "#7c3aed",
  UTILITIES: "#475569",
  TRANSPORT: "#334155",
  MAINTENANCE: "#78716c",
  OTHER: "#9ca3af",
};

// Ordered keyword -> category rules. First match wins. Product names in the
// source bills are terse trade names (e.g. "DAL ARHAR 5%", "SILVER FOIL"),
// so this is a best-effort classifier — every product's category stays
// editable in the Product Catalog since misclassification is expected.
const RULES: [RegExp, ProductCategory][] = [
  [/\b(silver foil|clean film|duster|magic brush|foil|packaging|pouch|box)\b/i, "PACKAGING"],
  [/\b(nirma|surf|detergent|soap|phenyl|sanitizer|cleaning)\b/i, "CLEANING_SUPPLIES"],
  [/\b(ghee|oil tin|mustard oil|olive|oilve|refined oil)\b/i, "OILS_GHEE"],
  [/\b(dal |daal |urad|arhar|chana(?! kabuli)|moger|masoor|rajma|kabuli|moong)\b/i, "PULSES_DALS"],
  [/\b(aata|atta|maida|besan|rice|suji|poha|maaze strach|corn flour)\b/i, "GRAINS_FLOURS"],
  [
    /\b(jeera|dhaniya|haldi|mirchi|masala|kalongi|methi|elaichi|cardemom|cardamom|clove|dalchini|black paper|pepper|ajwain|rai|hing|tejpata|garam masala|kasturi|red chilli|green chilli(?! sauce)|zeera|saunf)\b/i,
    "SPICES_MASALAS",
  ],
  [/\b(sauce|vinegar|ketchup|soya sauce|chutney|pickle|achaar)\b/i, "CONDIMENTS_SAUCES"],
  [/\b(kaju|magaj|namkin|biscuit|kitkat|oreo|papad|boondi|noodels|noodles|fussili|penne|pasta|snack|bidam|pista|peanut|badi)\b/i, "SNACKS_NAMKEEN"],
  [/\b(tea|coffee|honey|kewra|gulab jal|drink|juice|orange|water bot)\b/i, "BEVERAGES"],
  [/\b(mayonnaise|cheese|butter|milk|dairy|mc favourita|go moz)\b/i, "DAIRY"],
  [
    /\b(salt|sugar|m\.s\.g|msg|mdh|pcm|coconut powder|custered|custard|vermicelli|maggi|frozen|peas|mushroom|paineappal|pineapple|fruit cocktail|nutela|chocolate|bread crumbs|no 1 orange|no 1 green|bush|golden crown|dabur honey)\b/i,
    "RAW_MATERIALS",
  ],
];

export function inferCategory(productName: string): ProductCategory {
  for (const [pattern, category] of RULES) {
    if (pattern.test(productName)) return category;
  }
  return "OTHER";
}

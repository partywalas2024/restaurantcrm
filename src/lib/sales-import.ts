// Column-mapping guesser for POS sales exports (built around PetPooja's
// common report layouts, but written generically since exact column names
// vary by report type / POS version — the UI always shows the guess for the
// user to correct before anything is imported).

export type SalesField = "date" | "itemName" | "quantity" | "amount" | "orderType" | "paymentMode" | "orderId";

export const FIELD_LABELS: Record<SalesField, string> = {
  date: "Date",
  itemName: "Item Name",
  quantity: "Quantity",
  amount: "Amount / Revenue",
  orderType: "Order Type / Channel (optional)",
  paymentMode: "Payment Mode (optional)",
  orderId: "Order / Bill No. (optional, used to count covers)",
};

export const REQUIRED_FIELDS: SalesField[] = ["date", "itemName", "quantity", "amount"];

const ALIASES: Record<SalesField, string[]> = {
  date: ["date", "orderdate", "billdate", "txndate", "saledate", "invoicedate"],
  itemName: ["itemname", "item", "productname", "product", "menuitem", "dishname", "dish"],
  quantity: ["qty", "quantity", "itemqty", "qtysold", "unitssold"],
  amount: [
    "amount",
    "total",
    "netamount",
    "totalamount",
    "itemtotal",
    "subtotal",
    "grossamount",
    "salesamount",
    "finalamount",
    "netsales",
    "itemamount",
  ],
  orderType: ["ordertype", "channel", "ordersource", "servicetype", "saletype"],
  paymentMode: ["paymentmode", "paymenttype", "paymentmethod", "modeofpayment", "payment"],
  orderId: ["orderid", "orderno", "invoiceno", "billno", "ordernumber", "kotno", "tokenno"],
};

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function guessMapping(headers: string[]): Partial<Record<SalesField, string>> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  const mapping: Partial<Record<SalesField, string>> = {};

  (Object.keys(ALIASES) as SalesField[]).forEach((field) => {
    const aliases = ALIASES[field];
    const match = normalized.find((h) => aliases.includes(h.norm)) ?? normalized.find((h) => aliases.some((a) => h.norm.includes(a)));
    if (match) mapping[field] = match.raw;
  });

  return mapping;
}

/** Maps a free-text order-type value from the export to our four revenue channels. */
export function classifyChannel(value: string | undefined): "dineIn" | "delivery" | "takeaway" | "other" {
  if (!value) return "other";
  const v = value.toLowerCase();
  if (v.includes("dine")) return "dineIn";
  if (v.includes("deliver") || v.includes("zomato") || v.includes("swiggy")) return "delivery";
  if (v.includes("take") || v.includes("pickup") || v.includes("pick up") || v.includes("parcel")) return "takeaway";
  return "other";
}

/** Maps a free-text payment-mode value to our four payment buckets. */
export function classifyPayment(value: string | undefined): "cash" | "upi" | "card" | "other" {
  if (!value) return "other";
  const v = value.toLowerCase();
  if (v.includes("cash")) return "cash";
  if (v.includes("upi") || v.includes("gpay") || v.includes("phonepe") || v.includes("paytm")) return "upi";
  if (v.includes("card") || v.includes("credit") || v.includes("debit")) return "card";
  return "other";
}

// Arithmetic verification for extracted bills.
//
// Deliberately free of Prisma and `server-only` so the same rules run in two
// places: server-side right after extraction, and in the browser as the user
// edits figures on the review screen. One implementation means the warning you
// see while editing is the warning that was computed when the bill was read.

export type CheckableItem = {
  name: string;
  qty: number;
  rate: number;
  amount: number;
};

export type CheckableBill = {
  billNumberUncertain?: boolean;
  subtotal: number;
  sgst: number;
  cgst: number;
  roundoff: number;
  grandTotal: number;
  items: CheckableItem[];
};

/**
 * Independent arithmetic check on a bill.
 *
 * Reading a bill is inherently fallible — a smudged digit becomes a wrong
 * number in the books. Rather than trusting the transcription, we re-derive the
 * totals ourselves: line items must sum to the subtotal, and subtotal plus
 * taxes must equal the grand total. Anything that fails is surfaced for review.
 */
export function checkBill(bill: CheckableBill): string[] {
  const warnings: string[] = [];
  const money = (n: number) =>
    `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // A rupee of slack absorbs per-line rounding on the printed bill.
  const TOLERANCE = 1;

  // Some vendors print tax-inclusive line amounts — items then sum to the
  // grand total, not the subtotal, and no single row's qty x rate matches its
  // amount because rate is the pre-tax unit price. That is a different bill
  // layout, not an error: detect it once and skip the checks that assume
  // pre-tax line items.
  let taxInclusiveLayout = false;

  if (bill.items.length === 0) {
    warnings.push("No line items were read from this bill.");
  } else {
    const itemsSum = bill.items.reduce((s, i) => s + i.amount, 0);
    const matchesSubtotal = Math.abs(itemsSum - bill.subtotal) <= TOLERANCE;
    const matchesGrandTotal = Math.abs(itemsSum - bill.grandTotal) <= TOLERANCE;
    taxInclusiveLayout = matchesGrandTotal && !matchesSubtotal;
    if (!matchesSubtotal && !matchesGrandTotal) {
      warnings.push(
        `Line items add up to ${money(itemsSum)} but the subtotal reads ${money(bill.subtotal)} — a difference of ${money(Math.abs(itemsSum - bill.subtotal))}.`,
      );
    }
  }

  const computedTotal = bill.subtotal + bill.sgst + bill.cgst + bill.roundoff;
  if (Math.abs(computedTotal - bill.grandTotal) > TOLERANCE) {
    warnings.push(
      `Subtotal plus taxes comes to ${money(computedTotal)} but the grand total reads ${money(bill.grandTotal)}.`,
    );
  }

  if (!taxInclusiveLayout) {
    for (const item of bill.items) {
      const expected = item.qty * item.rate;
      if (Math.abs(expected - item.amount) > TOLERANCE) {
        warnings.push(
          `"${item.name}": ${item.qty} x ${money(item.rate)} should be ${money(expected)}, but the amount reads ${money(item.amount)}.`,
        );
      }
    }
  }

  if (bill.billNumberUncertain) {
    warnings.push("The bill number was hard to read — check it against the paper copy.");
  }

  return warnings;
}

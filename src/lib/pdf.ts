export const BRAND_RGB: [number, number, number] = [180, 69, 31];

export function inr(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

type RestaurantInfo = { name: string; address?: string | null; phone?: string | null; gstin?: string | null };

/** Draws a consistent letterhead (restaurant name + contact line + doc title) and returns the Y to start content below it. */
export function addLetterhead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  restaurant: RestaurantInfo,
  docTitle: string,
  subtitle?: string
): number {
  doc.setFontSize(18);
  doc.setTextColor(...BRAND_RGB);
  doc.text(restaurant.name, 14, 18);

  let y = 24;
  doc.setFontSize(9);
  doc.setTextColor(120);
  const contactBits = [restaurant.address, restaurant.phone, restaurant.gstin ? `GSTIN: ${restaurant.gstin}` : null].filter(
    Boolean
  );
  if (contactBits.length > 0) {
    const split = doc.splitTextToSize(contactBits.join(" · "), 180);
    doc.text(split, 14, y);
    y += split.length * 4 + 2;
  }

  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(0.5);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.text(docTitle, 14, y);
  y += 6;

  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(subtitle, 14, y);
    y += 6;
  }

  doc.setTextColor(0);
  return y + 4;
}

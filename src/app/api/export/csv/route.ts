// CSV export. `?kind=` selects the dataset (bills, expenses, inventory, ...),
// mirroring whatever the calling page is showing.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getBills, getVendors, getProducts } from "@/lib/data";
import { getRestaurant } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { ProductCategory } from "@/generated/prisma/enums";
import { apiRestaurantGuard } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await apiRestaurantGuard();
  if ("denied" in guard) return guard.denied;
  const { user } = guard;

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "bills";
  const profile = await getRestaurant(user.restaurantId);
  const filePrefix = profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  let rows: Record<string, unknown>[] = [];
  let filename = "export.csv";

  if (kind === "bills") {
    const bills = await getBills(user.restaurantId, {
      vendorId: sp.get("vendorId") || undefined,
      category: (sp.get("category") as ProductCategory) || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      minAmount: sp.get("minAmount") ? Number(sp.get("minAmount")) : undefined,
      maxAmount: sp.get("maxAmount") ? Number(sp.get("maxAmount")) : undefined,
      search: sp.get("search") || undefined,
      paymentStatus: sp.get("paymentStatus") || undefined,
    });
    rows = bills.map((b) => ({
      "Bill Number": b.billNumber,
      Date: formatDate(b.date),
      Type: b.type,
      Vendor: b.vendor.name,
      Category: CATEGORY_LABELS[b.category],
      "Line Items": b.lineItems.length,
      Subtotal: b.subtotal,
      SGST: b.sgst,
      CGST: b.cgst,
      "Grand Total": b.grandTotal,
      "Payment Status": b.paymentStatus,
      Notes: b.notes ?? "",
    }));
    filename = `${filePrefix}-bills.csv`;
  } else if (kind === "vendors") {
    const vendors = await getVendors(user.restaurantId);
    rows = vendors.map((v) => ({
      Vendor: v.name,
      Phone: v.phone ?? "",
      Address: v.address ?? "",
      "Total Purchase Amount": v.totalAmount,
      "Total Bills": v.totalBills,
      "Items Supplied": v.itemsSupplied,
      "Pending Amount": v.pendingAmount,
      "Last Order Date": v.lastOrderDate ? formatDate(v.lastOrderDate) : "",
    }));
    filename = `${filePrefix}-vendors.csv`;
  } else if (kind === "products") {
    const products = await getProducts(user.restaurantId);
    rows = products.map((p) => ({
      Product: p.name,
      Category: CATEGORY_LABELS[p.category],
      Unit: p.unit,
      "Current Stock": p.currentStock,
      "Reorder Level": p.reorderLevel,
      "Last Cost Price": p.lastCostPrice,
      "Qty Purchased": p.qtyPurchased,
      "Total Spend": p.totalSpend,
      "Times Purchased": p.timesPurchased,
      Vendor: p.vendorName,
      "Last Purchase Date": p.lastPurchaseDate ? formatDate(p.lastPurchaseDate) : "",
      Status: p.status,
    }));
    filename = `${filePrefix}-products.csv`;
  }

  const csv = Papa.unparse(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

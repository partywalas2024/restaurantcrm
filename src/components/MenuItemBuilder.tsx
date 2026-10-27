"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { createMenuItemWithRecipe, type MenuFormState } from "@/lib/sales-actions";

type Product = { id: string; name: string; unit: string; lastCostPrice: number };
type Row = { key: number; text: string; qty: string; newUnit: string };

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function MenuItemBuilder({ products }: { products: Product[] }) {
  const [state, formAction, pending] = useActionState<MenuFormState, FormData>(createMenuItemWithRecipe, {});
  const [price, setPrice] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: 1, text: "", qty: "", newUnit: "" }]);
  const [nextKey, setNextKey] = useState(2);

  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  const match = (text: string) => byName.get(text.trim().toLowerCase());

  const priced = rows.map((r) => {
    const p = match(r.text);
    const qty = Number(r.qty);
    return { p, cost: p && Number.isFinite(qty) ? qty * p.lastCostPrice : 0 };
  });
  const totalCost = priced.reduce((s, x) => s + x.cost, 0);
  const sell = Number(price);
  const margin = Number.isFinite(sell) ? sell - totalCost : 0;
  const marginPct = Number.isFinite(sell) && sell > 0 ? (margin / sell) * 100 : null;
  const unknownCost = rows.some((r, i) => r.text.trim() && (!priced[i].p || priced[i].p!.lastCostPrice === 0));

  function patch(key: number, change: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className={LABEL} htmlFor="mi-name">Dish name *</label>
          <input id="mi-name" name="name" required className={INPUT} placeholder="e.g. Paneer Butter Masala" />
        </div>
        <div>
          <label className={LABEL} htmlFor="mi-cat">Category</label>
          <input id="mi-cat" name="category" className={INPUT} placeholder="e.g. Main Course" />
        </div>
        <div>
          <label className={LABEL} htmlFor="mi-price">Selling price (₹) *</label>
          <input id="mi-price" name="sellingPrice" type="number" step="any" min="0" required value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} />
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">Recipe — ingredients for ONE serving</h3>
        <p className="mb-3 text-xs text-muted">
          Start typing an ingredient to pick it from your products. Quantities use the product&apos;s own unit (a 50 g pinch of a product bought in KG is 0.05). If an ingredient isn&apos;t listed yet,
          just type its name and a unit — it&apos;s created now and its cost fills in from the first bill.
        </p>

        <datalist id="product-options">
          {products.map((p) => (<option key={p.id} value={p.name} />))}
        </datalist>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const p = priced[i].p;
            const typed = r.text.trim().length > 0;
            return (
              <div key={r.key} className="grid grid-cols-12 items-start gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <input
                    list="product-options"
                    value={r.text}
                    onChange={(e) => patch(r.key, { text: e.target.value })}
                    placeholder="Ingredient"
                    aria-label="Ingredient"
                    className={INPUT}
                  />
                  <input type="hidden" name="productId" value={p?.id ?? ""} />
                  <input type="hidden" name="newName" value={p ? "" : r.text.trim()} />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <input name="quantity" type="number" step="any" min="0" value={r.qty} onChange={(e) => patch(r.key, { qty: e.target.value })} placeholder="Qty" aria-label="Quantity" className={INPUT} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  {p ? (
                    <p className="px-1 py-1.5 text-sm text-muted">{p.unit}</p>
                  ) : typed ? (
                    <input name="newUnit" value={r.newUnit} onChange={(e) => patch(r.key, { newUnit: e.target.value })} placeholder="Unit" aria-label="Unit for new ingredient" className={INPUT} />
                  ) : (
                    <input type="hidden" name="newUnit" value="" />
                  )}
                </div>
                <div className="col-span-3 flex items-center justify-between gap-1 sm:col-span-3">
                  <span className="px-1 py-1.5 text-sm">
                    {p ? (p.lastCostPrice > 0 ? inr(priced[i].cost) : <span className="text-xs text-muted">no cost yet</span>) : typed ? <span className="text-xs text-info">new</span> : ""}
                  </span>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="text-crit hover:opacity-70" aria-label="Remove ingredient">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => { setRows((prev) => [...prev, { key: nextKey, text: "", qty: "", newUnit: "" }]); setNextKey((k) => k + 1); }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
        >
          <Plus size={14} /> Add ingredient
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-muted">Recipe cost</p>
          <p className="text-lg font-semibold">{inr(totalCost)}</p>
        </div>
        <div>
          <p className="text-muted">Margin</p>
          <p className="text-lg font-semibold">{price ? inr(margin) : "—"}</p>
        </div>
        <div>
          <p className="text-muted">Margin %</p>
          <p className="text-lg font-semibold">{marginPct !== null ? `${marginPct.toFixed(1)}%` : "—"}</p>
        </div>
      </div>
      {unknownCost && (
        <p className="text-xs text-warn">Some ingredients have no purchase cost yet, so the cost and margin above are understated until a bill for them is uploaded.</p>
      )}

      <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto sm:px-8">
        {pending ? "Saving…" : "Save Menu Item & Recipe"}
      </button>
    </form>
  );
}

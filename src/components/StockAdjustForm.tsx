import { adjustStock } from "@/lib/actions";

export function StockAdjustForm({ productId }: { productId: string }) {
  return (
    <form action={adjustStock} className="flex items-center gap-1.5">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="number"
        name="delta"
        step="any"
        placeholder="±qty"
        className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs"
        required
      />
      <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted">
        Apply
      </button>
    </form>
  );
}

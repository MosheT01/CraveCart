import type { CartItemSummary } from "@/lib/types"

interface CartItemsListProps {
  items: CartItemSummary[]
}

export function CartItemsList({ items }: CartItemsListProps) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.upc}-${item.ingredient}`} className="flex items-center justify-between rounded-2xl border border-black/6 bg-black/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{item.ingredient}</p>
            <p className="text-xs text-slate-500">{item.selectedProduct}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{item.price}</p>
            <p className="text-xs text-slate-500">{item.quantity} x {item.unit}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

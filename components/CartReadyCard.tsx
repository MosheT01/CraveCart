import { CheckCircle2, ExternalLink, ShoppingBag, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CartItemsList } from "@/components/CartItemsList"
import type { CartArtifact } from "@/lib/types"

interface CartReadyCardProps {
  cart: CartArtifact
}

export function CartReadyCard({ cart }: CartReadyCardProps) {
  const isPartial = cart.status === "partial_cart_ready"

  return (
    <section className="rounded-[32px] border border-white/20 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(246,241,232,0.94))] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {isPartial ? "Partially Ready" : "Cart Ready"}
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              {isPartial ? "Your Kroger cart is mostly ready" : "Your Kroger cart is ready"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{cart.dish} is prepared for your configured Kroger store.</p>
          </div>
          {cart.message ? <p className="text-sm text-amber-700">{cart.message}</p> : null}
        </div>

        <a href={cart.openCartUrl} target="_blank" rel="noreferrer">
          <Button size="lg" className="rounded-full bg-slate-950 px-6 text-white hover:bg-slate-800">
            Open Kroger Cart
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </a>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <SummaryTile icon={ShoppingBag} label="Items Added" value={String(cart.itemsAdded)} />
        <SummaryTile icon={Store} label="Retailer" value={cart.retailer} />
        <SummaryTile icon={CheckCircle2} label="Estimated Total" value={cart.estimatedTotal} />
        <SummaryTile icon={ShoppingBag} label="Recipe Source" value={cart.recipeSource.replace("_", " ")} />
      </div>

      {cart.video ? (
        <div className="mt-6 rounded-[24px] border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Recipe Video</p>
          <a href={cart.video.url} target="_blank" rel="noreferrer" className="mt-2 block text-primary hover:underline">
            {cart.video.title}
          </a>
          <p className="text-xs text-slate-500">{cart.video.channel}</p>
        </div>
      ) : null}

      <details className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white/80">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900">See what was added</summary>
        <div className="border-t border-slate-200 px-5 py-4">
          <CartItemsList items={cart.items} />
          {cart.unmatchedIngredients.length > 0 ? (
            <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Unmatched: {cart.unmatchedIngredients.join(", ")}
            </div>
          ) : null}
        </div>
      </details>
    </section>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShoppingBag
  label: string
  value: string
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.24em]">{label}</span>
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}

"use client"

import { cn } from "@/lib/utils"

// Floating food decorations — desktop only, purely visual
const FLOATERS = [
  { emoji: "🍕", style: { top: "8%",   left: "4%",   fontSize: "2.4rem", animationDuration: "6.2s", animationDelay: "0s"   } },
  { emoji: "🍔", style: { top: "18%",  right: "6%",  fontSize: "2.9rem", animationDuration: "7.5s", animationDelay: "1.3s" } },
  { emoji: "🌮", style: { bottom: "28%", left: "8%", fontSize: "2.1rem", animationDuration: "5.8s", animationDelay: "2.2s" } },
  { emoji: "🍜", style: { top: "48%",  right: "4%",  fontSize: "2.5rem", animationDuration: "8.0s", animationDelay: "0.6s" } },
  { emoji: "🛒", style: { top: "6%",   right: "26%", fontSize: "1.9rem", animationDuration: "6.7s", animationDelay: "3.1s" } },
  { emoji: "🍣", style: { bottom: "14%", right: "12%", fontSize: "2.3rem", animationDuration: "7.2s", animationDelay: "1.9s" } },
  { emoji: "🥗", style: { bottom: "22%", left: "28%", fontSize: "1.8rem", animationDuration: "5.6s", animationDelay: "0.4s" } },
  { emoji: "🍗", style: { top: "38%",  left: "2%",  fontSize: "2.1rem", animationDuration: "7.9s", animationDelay: "2.7s" } },
  { emoji: "🥩", style: { top: "70%",  left: "18%", fontSize: "1.7rem", animationDuration: "6.4s", animationDelay: "1.0s" } },
  { emoji: "🫕", style: { top: "12%",  right: "44%", fontSize: "1.6rem", animationDuration: "7.1s", animationDelay: "3.5s" } },
]

const CATEGORIES = [
  { emoji: "🍕", label: "Pizza",    query: "Find a homemade pizza recipe video and buy the groceries" },
  { emoji: "🍔", label: "Burgers",  query: "Find a smash burger recipe video and buy the ingredients" },
  { emoji: "🍝", label: "Pasta",    query: "Find a creamy pasta recipe video and buy the groceries" },
  { emoji: "🍣", label: "Sushi",    query: "Tell me about a sushi making video" },
  { emoji: "🌮", label: "Tacos",    query: "Find a street taco recipe video and buy the ingredients" },
  { emoji: "🥗", label: "Salads",   query: "Find a Caesar salad video and buy the groceries" },
  { emoji: "🍜", label: "Ramen",    query: "Find a homemade ramen recipe video and buy the ingredients" },
  { emoji: "🍗", label: "Chicken",  query: "Find a crispy fried chicken recipe video and buy the ingredients" },
]

interface WelcomeHeroProps {
  onSelectCategory: (query: string) => void
  /** When false, chips are gated (logged-out previews). Signed-in users can chat either way — link Kroger for cart. */
  agentChatEnabled: boolean
}

export function WelcomeHero({ onSelectCategory, agentChatEnabled }: WelcomeHeroProps) {
  return (
    <div className="relative w-full max-w-3xl">
      {/* ── Floating food emojis (desktop only) ─────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block"
        aria-hidden="true"
      >
        {FLOATERS.map((f, i) => (
          <span
            key={i}
            className="absolute select-none"
            style={{
              ...f.style,
              opacity: 0.055,
              animation: `food-float ${f.style.animationDuration} ease-in-out ${f.style.animationDelay} infinite`,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-7 py-6 text-center md:gap-8 md:py-8">

        {/* Tagline — single focal block */}
        <div className="max-w-xl space-y-2.5" style={{ animation: "fade-in-up 0.55s ease-out both" }}>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/26">
            Your personal food agent
          </p>

          <h2 className="text-balance text-[clamp(2rem,6vw,2.85rem)] font-bold leading-[1.08] tracking-tight">
            <span className="bg-gradient-to-r from-white via-white/95 to-white/75 bg-clip-text text-transparent">
              From craving
            </span>{" "}
            <span className="bg-gradient-to-br from-primary via-primary/88 to-primary/55 bg-clip-text text-transparent">
              to cart
            </span>
            <span className="text-white/34" style={{ fontWeight: 400 }}>
              {" "}
              — in seconds.
            </span>
          </h2>

          <p className="mx-auto max-w-md text-[13px] leading-relaxed text-white/36 md:text-[14px]">
            Describe a craving or paste a link — recipes, carts, and checkout stay threaded in chat.
          </p>
        </div>

        {/* Category chips */}
        <div className="w-full max-w-2xl" style={{ animation: "fade-in-up 0.55s ease-out 0.12s both" }}>
          <p className="mb-2.5 text-center text-[10px] uppercase tracking-[0.2em] text-white/26">
            Try a craving
          </p>

          <div className="scrollbar-none mx-auto flex max-w-full gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:justify-center md:overflow-visible md:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => onSelectCategory(cat.query)}
                disabled={!agentChatEnabled}
                title={agentChatEnabled ? cat.query : "Sign in to use quick picks"}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium md:px-3.5 md:py-2",
                  "transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/45",
                  agentChatEnabled
                    ? [
                        "border-white/[0.09] bg-white/[0.04] text-white/58",
                        "hover:border-primary/32 hover:bg-primary/[0.09] hover:text-white/88",
                        "active:scale-[0.98]",
                      ].join(" ")
                    : "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-white/22"
                )}
              >
                <span aria-hidden="true">{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {!agentChatEnabled ? (
            <p className="mt-2 text-center text-[11px] text-white/22">Sign in to use cravings.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

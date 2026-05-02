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

const STATS = [
  { icon: "🎬", label: "Recipe videos" },
  { icon: "🛒", label: "Live cart writes" },
  { icon: "⚡", label: "Gemini powered" },
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
  krogerConnected: boolean
}

export function WelcomeHero({ onSelectCategory, krogerConnected }: WelcomeHeroProps) {
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
              opacity: 0.09,
              animation: `food-float ${f.style.animationDuration} ease-in-out ${f.style.animationDelay} infinite`,
            }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-8 py-10 text-center">

        {/* Tagline */}
        <div className="space-y-3" style={{ animation: "fade-in-up 0.55s ease-out both" }}>
          <p className="text-[10px] uppercase tracking-[0.32em] text-white/28">
            Your personal food agent
          </p>

          <h2 className="text-[2.6rem] font-bold leading-[1.12] tracking-tight md:text-[3.2rem]">
            <span className="bg-gradient-to-r from-white via-white/95 to-white/70 bg-clip-text text-transparent">
              From craving
            </span>
            <br />
            <span className="bg-gradient-to-br from-primary via-primary/85 to-primary/55 bg-clip-text text-transparent">
              to cart
            </span>
            <span
              className="text-white/38"
              style={{ fontWeight: 300 }}
            >
              {" "}— in seconds.
            </span>
          </h2>

          <p className="mx-auto max-w-sm text-[14px] leading-relaxed text-white/38">
            Describe a dish, paste a video link, or just say "buy groceries" — the agent handles everything live.
          </p>
        </div>

        {/* Stat labels — informational only, not interactive */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          style={{ animation: "fade-in-up 0.55s ease-out 0.14s both" }}
          aria-label="Agent capabilities"
        >
          {STATS.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 select-none">
              <span className="text-[12px] leading-none" aria-hidden="true">{s.icon}</span>
              <span className="text-[11px] text-white/30">{s.label}</span>
              {i < STATS.length - 1 && (
                <span className="ml-4 text-white/12 text-[10px]" aria-hidden="true">·</span>
              )}
            </span>
          ))}
        </div>

        {/* Category chips — horizontal scroll */}
        <div
          className="w-full"
          style={{ animation: "fade-in-up 0.55s ease-out 0.26s both" }}
        >
          <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-white/22">
            Quick picks
          </p>

          <div className="scrollbar-none flex gap-2 overflow-x-auto pb-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => onSelectCategory(cat.query)}
                disabled={!krogerConnected}
                title={krogerConnected ? cat.query : "Connect Kroger first"}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium",
                  "transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50",
                  krogerConnected
                    ? [
                        "border-white/10 bg-white/[0.05] text-white/60",
                        "hover:border-primary/35 hover:bg-primary/10 hover:text-white/90",
                        "active:scale-95",
                      ].join(" ")
                    : "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-white/20"
                )}
              >
                <span aria-hidden="true">{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {!krogerConnected && (
            <p className="mt-2 text-[11px] text-white/20">
              Connect Kroger above to use quick picks
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

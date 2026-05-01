import type { NormalizedCraving } from "@/lib/types"

const CANONICAL_MAPPINGS: Array<{ match: RegExp; dish: string }> = [
  { match: /\bamerican cheeseburger\b/i, dish: "American cheeseburger" },
  { match: /\bcheeseburger\b/i, dish: "American cheeseburger" },
  { match: /\bburger\b/i, dish: "American cheeseburger" },
  { match: /\bchicken alfredo\b/i, dish: "Chicken Alfredo" },
  { match: /\balfredo\b/i, dish: "Chicken Alfredo" },
  { match: /\bchocolate chip cookies?\b/i, dish: "Chocolate chip cookies" },
  { match: /\bcookies?\b/i, dish: "Chocolate chip cookies" },
  { match: /\bcaesar salad\b/i, dish: "Caesar salad" },
]

export function normalizeCraving(craving: string): NormalizedCraving {
  const cleaned = craving
    .replace(/^i(?:'| a)?m craving\s+/i, "")
    .replace(/^i want\s+/i, "")
    .replace(/^make me\s+/i, "")
    .replace(/^find me\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim()

  const canonicalDish =
    CANONICAL_MAPPINGS.find((entry) => entry.match.test(cleaned))?.dish ||
    toTitleCase(cleaned)

  return {
    raw: craving,
    cleaned,
    canonicalDish,
    searchQuery: `${canonicalDish} recipe`,
  }
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

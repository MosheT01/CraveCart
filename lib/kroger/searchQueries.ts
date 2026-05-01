import type { IngredientCategory } from "@/lib/types"

const EXACT_VARIANTS: Record<string, string[]> = {
  "yellow onions": ["yellow onion", "onion"],
  "fresh cilantro": ["cilantro"],
  "fresh coriander or cilantro": ["cilantro"],
  "coriander or cilantro": ["cilantro"],
  "green leaf lettuce": ["green leaf lettuce", "lettuce"],
  "iceberg lettuce": ["iceberg lettuce", "lettuce"],
  "bell peppers": ["bell peppers", "bell pepper", "peppers"],
  "brown or yellow onion": ["yellow onion", "onion"],
  "corn tortillas": ["corn tortillas", "tortillas"],
  "flour tortillas": ["flour tortillas", "tortillas"],
  "crunchy taco shells": ["taco shells", "crunchy taco shells"],
  "shredded cheddar cheese": ["cheddar cheese", "shredded cheddar cheese"],
  "american cheese slices": ["american cheese", "american cheese slices"],
  "shredded monterey jack cheese": ["monterey jack cheese"],
  "shredded colby jack cheese": ["colby jack cheese"],
  "processed cheese product velveeta": ["velveeta", "processed cheese"],
  "canned diced green chilies": ["diced green chilies", "green chilies"],
  "canned refried beans": ["refried beans"],
  "canned rotel diced tomatoes and green chilies": ["rotel", "rotel tomatoes", "diced tomatoes and green chilies"],
  "mexican hot sauce": ["hot sauce", "mexican hot sauce"],
  "dill pickle relish": ["pickle relish", "dill pickle relish"],
  "fresh cherries": ["cherries"],
  "garlic cloves": ["garlic"],
  "parmesan cheese": ["parmesan cheese", "grated parmesan cheese"],
  "fettuccine": ["fettuccine pasta", "fettuccine"],
}

const STRIP_TOKENS = new Set([
  "fresh",
  "canned",
  "shredded",
  "processed",
  "whole",
  "medium",
  "large",
  "jumbo",
  "boneless",
  "skinless",
  "uncooked",
  "ripe",
  "gluten",
  "free",
])

interface BuildKrogerSearchQueriesInput {
  query: string
  ingredientName?: string
  category?: IngredientCategory
}

export function buildKrogerSearchQueries(input: BuildKrogerSearchQueriesInput) {
  const variants = new Set<string>()
  const candidates = [input.query, input.ingredientName ?? ""]

  for (const candidate of candidates) {
    const normalized = normalizeSearchText(candidate)
    if (!normalized) {
      continue
    }

    addVariant(variants, normalized)
    addVariant(variants, singularizePhrase(normalized))

    for (const exact of EXACT_VARIANTS[normalized] ?? []) {
      addVariant(variants, exact)
      addVariant(variants, singularizePhrase(exact))
    }

    const stripped = stripDescriptors(normalized)
    addVariant(variants, stripped)
    addVariant(variants, singularizePhrase(stripped))

    for (const option of splitAlternatives(normalized)) {
      addVariant(variants, option)
      addVariant(variants, singularizePhrase(option))
      for (const exact of EXACT_VARIANTS[option] ?? []) {
        addVariant(variants, exact)
        addVariant(variants, singularizePhrase(exact))
      }
    }
  }

  if (input.category === "produce") {
    const produceFallback = normalizeSearchText(input.ingredientName ?? input.query)
    addVariant(variants, singularizePhrase(produceFallback))
  }

  return Array.from(variants).filter(Boolean)
}

function addVariant(variants: Set<string>, value: string) {
  const normalized = normalizeSearchText(value)
  if (normalized) {
    variants.add(normalized)
  }
}

function stripDescriptors(value: string) {
  const stripped = value
    .split(" ")
    .filter((token) => token && !STRIP_TOKENS.has(token))
    .join(" ")

  return stripped || value
}

function singularizePhrase(value: string) {
  return value
    .split(" ")
    .map((token) => singularizeToken(token))
    .join(" ")
}

function singularizeToken(token: string) {
  if (token.endsWith("ies") && token.length > 3) {
    return `${token.slice(0, -3)}y`
  }

  if (token.endsWith("oes") && token.length > 3) {
    return token.slice(0, -2)
  }

  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    return token.slice(0, -1)
  }

  return token
}

function splitAlternatives(value: string) {
  return value
    .split(/\s+or\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .replace(/[/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

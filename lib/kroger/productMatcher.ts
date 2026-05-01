import type { ExtractedIngredient, KrogerProduct, ProductMatch } from "@/lib/types"

export function scoreProductMatch(ingredient: ExtractedIngredient, product: KrogerProduct): number {
  const ingredientTokens = tokenize(ingredient.normalizedName)
  const productText = `${product.description} ${product.brand ?? ""} ${product.size ?? ""}`.toLowerCase()
  const productTokens = tokenize(productText)
  if (violatesSemanticGuard(ingredient, productText)) {
    return 0
  }
  let score = 0

  for (const token of ingredientTokens) {
    if (productTokens.has(token)) {
      score += 0.18
    }
  }

  if (product.description.toLowerCase() === ingredient.normalizedName.toLowerCase()) {
    score += 0.35
  }

  if (product.brand?.toLowerCase().includes("kroger")) {
    score += 0.05
  }

  if (product.modality === "PICKUP" || product.modality === "DELIVERY") {
    score += 0.08
  }

  if (product.priceValue != null) {
    score += Math.max(0, 0.2 - product.priceValue / 100)
  }

  if (ingredient.category === "meat" && /beef|chicken|turkey|pork/.test(product.description.toLowerCase())) {
    score += 0.08
  }

  if (ingredient.category === "bakery" && /buns|bread|roll/.test(product.description.toLowerCase())) {
    score += 0.08
  }

  if (ingredient.category === "produce" && /\b(each|ct|count|lb|bag|bunch)\b/.test(productText)) {
    score += 0.08
  }

  if (ingredient.category === "beverage" && /\b(tequila|vodka|rum|gin|whiskey|bourbon|liqueur|amaro|amaretto|wine|beer)\b/.test(productText)) {
    score += 0.1
  }

  return Math.min(0.99, Math.max(0, score))
}

export async function matchIngredientToProduct(
  ingredient: ExtractedIngredient,
  products: KrogerProduct[],
): Promise<ProductMatch> {
  if (products.length === 0) {
    return {
      ingredient: ingredient.name,
      query: ingredient.normalizedName,
      selected: null,
      alternatives: [],
      confidence: 0,
      reasoning: "No Kroger products were returned for this ingredient.",
    }
  }

  const ranked = products
    .map((product) => ({ product, score: scoreProductMatch(ingredient, product) }))
    .sort((left, right) => right.score - left.score)

  const alternatives = ranked.slice(1, 4).map((entry) => entry.product)
  const selected = ranked[0].product
  const confidence = ranked[0].score

  return {
    ingredient: ingredient.name,
    query: ingredient.normalizedName,
    selected,
    alternatives,
    confidence,
    reasoning:
      confidence >= 0.5
        ? "Matched by deterministic token overlap, availability, and price heuristics."
        : "Best available candidate, but the match is weak.",
  }
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  )
}

function violatesSemanticGuard(ingredient: ExtractedIngredient, productText: string): boolean {
  const ingredientText = ingredient.normalizedName.toLowerCase()
  const guards: Array<{ token: string; pattern: RegExp }> = [
    { token: "yeast", pattern: /\byeast\b/ },
    { token: "flour", pattern: /\bflour\b/ },
    { token: "cheese", pattern: /\bcheese\b/ },
    { token: "bacon", pattern: /\bbacon\b/ },
    { token: "sausage", pattern: /\b(sausage|chorizo|kielbasa|bratwurst)\b/ },
    { token: "dough", pattern: /\b(dough|crust)\b/ },
    { token: "sauce", pattern: /\bsauce\b/ },
  ]

  if (ingredientText.includes("yeast") && /\b(donut|donuts|pastry|croissant|bagel)\b/.test(productText)) {
    return true
  }

  if (
    /\b(fettuccine|spaghetti|linguine|penne|pasta)\b/.test(ingredientText) &&
    /\b(meal|entree|dinner|skillet|bowl|frozen meal)\b/.test(productText)
  ) {
    return true
  }

  if (
    ingredient.category === "produce" &&
    /\b(soda|sparkling|drink|beverage|juice|cocktail|liqueur|ice cream|gelato|sorbet|candy|gum|chips|dressing|marinade|sauce|paste|seasoning|cola|fridge pack|fl oz|bottle|bottles|can|cans)\b/.test(productText)
  ) {
    return true
  }

  if (
    ingredient.category === "beverage" &&
    /\b(ice cream|gelato|sorbet|yogurt|candy|chocolate|cake|cookie)\b/.test(productText)
  ) {
    return true
  }

  if (
    /\b(tequila|vodka|rum|gin|whiskey|bourbon|liqueur|amaro|amaretto|wine|beer)\b/.test(ingredientText) &&
    !/\b(tequila|vodka|rum|gin|whiskey|bourbon|liqueur|amaro|amaretto|wine|beer)\b/.test(productText)
  ) {
    return true
  }

  return guards.some(({ token, pattern }) => ingredientText.includes(token) && !pattern.test(productText))
}

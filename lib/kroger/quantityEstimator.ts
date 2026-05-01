import type { ExtractedIngredient, KrogerProduct } from "@/lib/types"

type MeasureDimension = "count" | "mass_oz" | "volume_floz"

interface NormalizedMeasure {
  amount: number
  dimension: MeasureDimension
}

interface ParsedProductMeasure extends NormalizedMeasure {
  rawUnit: string
}

export function estimateCartQuantity(
  ingredient: Pick<ExtractedIngredient, "normalizedName" | "quantity" | "unit" | "category">,
  product: Pick<KrogerProduct, "size">,
): number {
  if (!ingredient.quantity || ingredient.quantity <= 0) {
    return 1
  }

  const measures = parseProductMeasures(product.size)
  if (measures.length === 0) {
    return 1
  }

  const requiredMeasure = normalizeIngredientMeasure(ingredient)
  if (!requiredMeasure) {
    return 1
  }

  const compatibleMeasures = measures.filter((measure) => measure.dimension === requiredMeasure.dimension)
  if (compatibleMeasures.length > 0) {
    return quantityFromMeasures(requiredMeasure.amount, compatibleMeasures)
  }

  const butterFallback = estimateButterQuantity(ingredient, measures)
  if (butterFallback) {
    return butterFallback
  }

  return 1
}

function quantityFromMeasures(requiredAmount: number, packageMeasures: ParsedProductMeasure[]) {
  const packageAmount = Math.max(...packageMeasures.map((measure) => measure.amount))
  if (!Number.isFinite(packageAmount) || packageAmount <= 0) {
    return 1
  }

  return clampRetailQuantity(Math.ceil(requiredAmount / packageAmount))
}

function normalizeIngredientMeasure(
  ingredient: Pick<ExtractedIngredient, "normalizedName" | "quantity" | "unit" | "category">,
): NormalizedMeasure | null {
  const normalizedUnit = normalizeUnitToken(ingredient.unit)
  if (normalizedUnit) {
    return unitToMeasure(ingredient.quantity ?? 0, normalizedUnit, ingredient.normalizedName)
  }

  if (!Number.isInteger(ingredient.quantity)) {
    return null
  }

  if (ingredient.category === "produce" || ingredient.category === "bakery" || looksDiscrete(ingredient.normalizedName)) {
    return {
      amount: ingredient.quantity ?? 0,
      dimension: "count",
    }
  }

  return null
}

function estimateButterQuantity(
  ingredient: Pick<ExtractedIngredient, "normalizedName" | "quantity" | "unit">,
  measures: ParsedProductMeasure[],
) {
  if (!/\bbutter\b/i.test(ingredient.normalizedName)) {
    return null
  }

  const normalizedUnit = normalizeUnitToken(ingredient.unit)
  if (!normalizedUnit) {
    return null
  }

  let requiredOunces: number | null = null
  if (normalizedUnit === "tbsp") {
    requiredOunces = (ingredient.quantity ?? 0) / 2
  } else if (normalizedUnit === "tsp") {
    requiredOunces = (ingredient.quantity ?? 0) / 6
  } else if (normalizedUnit === "cup") {
    requiredOunces = (ingredient.quantity ?? 0) * 8
  }

  if (!requiredOunces || requiredOunces <= 0) {
    return null
  }

  const massMeasures = measures.filter((measure) => measure.dimension === "mass_oz")
  if (massMeasures.length === 0) {
    return null
  }

  return quantityFromMeasures(requiredOunces, massMeasures)
}

function parseProductMeasures(size: string | null): ParsedProductMeasure[] {
  if (!size) {
    return []
  }

  const pattern =
    /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(fl\s*oz|fluid\s+ounces?|fluid\s+ounce|oz|ounces?|lbs?|pounds?|gallons?|gals?|gal|quarts?|qts?|qt|pints?|pts?|pt|cups?|cup|tablespoons?|tbsp|teaspoons?|tsp|kgs?|kilograms?|grams?|g|ct|count|counts|pkg|pkgs|package|packages|pk|slice|slices|clove|cloves|bulb|bulbs|can|cans|bunch|bunches|head|heads)\b/gi

  const measures: ParsedProductMeasure[] = []
  for (const match of size.matchAll(pattern)) {
    const amount = parseNumericToken(match[1])
    const normalizedUnit = normalizeUnitToken(match[2])
    if (!normalizedUnit || !Number.isFinite(amount) || amount <= 0) {
      continue
    }

    const normalized = unitToMeasure(amount, normalizedUnit, "")
    if (!normalized) {
      continue
    }

    measures.push({
      amount: normalized.amount,
      dimension: normalized.dimension,
      rawUnit: normalizedUnit,
    })
  }

  return measures
}

function unitToMeasure(amount: number, unit: string, ingredientName: string): NormalizedMeasure | null {
  switch (unit) {
    case "ct":
    case "slice":
    case "clove":
    case "bulb":
    case "can":
    case "bunch":
    case "head":
    case "package":
      return { amount, dimension: "count" }
    case "oz":
      return { amount, dimension: isLiquidIngredient(ingredientName) ? "volume_floz" : "mass_oz" }
    case "lb":
      return { amount: amount * 16, dimension: "mass_oz" }
    case "g":
      return { amount: amount * 0.035274, dimension: "mass_oz" }
    case "kg":
      return { amount: amount * 35.274, dimension: "mass_oz" }
    case "floz":
      return { amount, dimension: "volume_floz" }
    case "cup":
      return { amount: amount * 8, dimension: "volume_floz" }
    case "pt":
      return { amount: amount * 16, dimension: "volume_floz" }
    case "qt":
      return { amount: amount * 32, dimension: "volume_floz" }
    case "gal":
      return { amount: amount * 128, dimension: "volume_floz" }
    case "tbsp":
      return { amount: amount * 0.5, dimension: "volume_floz" }
    case "tsp":
      return { amount: amount / 6, dimension: "volume_floz" }
    default:
      return null
  }
}

function normalizeUnitToken(rawUnit: string | null | undefined) {
  if (!rawUnit) {
    return null
  }

  const unit = rawUnit.toLowerCase().trim()
  if (/^fl\s*oz$|^fluid\s+ounces?$|^fluid\s+ounce$/.test(unit)) return "floz"
  if (/^oz$|^ounce$|^ounces$/.test(unit)) return "oz"
  if (/^lb$|^lbs$|^pound$|^pounds$/.test(unit)) return "lb"
  if (/^g$|^gram$|^grams$/.test(unit)) return "g"
  if (/^kg$|^kgs$|^kilogram$|^kilograms$/.test(unit)) return "kg"
  if (/^cup$|^cups$/.test(unit)) return "cup"
  if (/^pt$|^pts$|^pint$|^pints$/.test(unit)) return "pt"
  if (/^qt$|^qts$|^quart$|^quarts$/.test(unit)) return "qt"
  if (/^gal$|^gals$|^gallon$|^gallons$/.test(unit)) return "gal"
  if (/^tbsp$|^tablespoon$|^tablespoons$/.test(unit)) return "tbsp"
  if (/^tsp$|^teaspoon$|^teaspoons$/.test(unit)) return "tsp"
  if (/^ct$|^count$|^counts$/.test(unit)) return "ct"
  if (/^slice$|^slices$/.test(unit)) return "slice"
  if (/^clove$|^cloves$/.test(unit)) return "clove"
  if (/^bulb$|^bulbs$/.test(unit)) return "bulb"
  if (/^can$|^cans$/.test(unit)) return "can"
  if (/^bunch$|^bunches$/.test(unit)) return "bunch"
  if (/^head$|^heads$/.test(unit)) return "head"
  if (/^pkg$|^pkgs$|^package$|^packages$|^pk$/.test(unit)) return "package"
  return null
}

function parseNumericToken(value: string) {
  const token = value.trim()
  if (/^\d+\s+\d+\/\d+$/.test(token)) {
    const [whole, fraction] = token.split(/\s+/)
    return Number(whole) + parseFraction(fraction)
  }

  if (/^\d+\/\d+$/.test(token)) {
    return parseFraction(token)
  }

  return Number(token)
}

function parseFraction(value: string) {
  const [numerator, denominator] = value.split("/").map(Number)
  if (!denominator) {
    return 0
  }

  return numerator / denominator
}

function clampRetailQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 1
  }

  return Math.min(12, Math.max(1, quantity))
}

function isLiquidIngredient(ingredientName: string) {
  return /\b(milk|cream|broth|stock|juice|water|vinegar|oil|sauce)\b/i.test(ingredientName)
}

function looksDiscrete(ingredientName: string) {
  return /\b(egg|eggs|onion|onions|tomato|tomatoes|lemon|lemons|lime|limes|bun|buns|roll|rolls|pepper|peppers|pickle|pickles|potato|potatoes|garlic|head|heads)\b/i.test(
    ingredientName,
  )
}

import { describe, expect, it } from "vitest"
import { scoreProductMatch } from "@/lib/kroger/productMatcher"

describe("scoreProductMatch", () => {
  it("prefers a direct ingredient match over a loose product", () => {
    const ingredient = {
      name: "ground beef 80/20",
      normalizedName: "ground beef",
      quantity: 2,
      unit: "lb",
      category: "meat" as const,
      required: true,
      pantryItem: false,
      notes: null,
    }

    const direct = {
      productId: "1",
      upc: "1",
      description: "Kroger Ground Beef 80/20",
      brand: "Kroger",
      size: "1 lb",
      priceValue: 7.99,
      priceLabel: "$7.99",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    const weak = {
      productId: "2",
      upc: "2",
      description: "Frozen Meatballs",
      brand: "Kroger",
      size: "24 oz",
      priceValue: 8.99,
      priceLabel: "$8.99",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    expect(scoreProductMatch(ingredient, direct)).toBeGreaterThan(scoreProductMatch(ingredient, weak))
  })

  it("rejects semantically wrong pantry matches like donuts for yeast", () => {
    const ingredient = {
      name: "fresh yeast",
      normalizedName: "fresh yeast",
      quantity: 1,
      unit: null,
      category: "pantry" as const,
      required: true,
      pantryItem: false,
      notes: null,
    }

    const proper = {
      productId: "1",
      upc: "1",
      description: "Kroger Active Dry Yeast",
      brand: "Kroger",
      size: "3 ct",
      priceValue: 1.39,
      priceLabel: "$1.39",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    const absurd = {
      productId: "2",
      upc: "2",
      description: "Bakery Fresh Glazed Yeast Donuts",
      brand: "Bakery Fresh",
      size: "12 ct",
      priceValue: 0,
      priceLabel: "$0.00",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    expect(scoreProductMatch(ingredient, proper)).toBeGreaterThan(scoreProductMatch(ingredient, absurd))
    expect(scoreProductMatch(ingredient, absurd)).toBe(0)
  })

  it("rejects prepared frozen meals when the ingredient is plain pasta", () => {
    const ingredient = {
      name: "fettuccine",
      normalizedName: "fettuccine pasta",
      quantity: 1,
      unit: "lb",
      category: "pantry" as const,
      required: true,
      pantryItem: false,
      notes: null,
    }

    const direct = {
      productId: "1",
      upc: "1",
      description: "Barilla Fettuccine Pasta",
      brand: "Barilla",
      size: "16 oz",
      priceValue: 2.19,
      priceLabel: "$2.19",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    const absurd = {
      productId: "2",
      upc: "2",
      description: "Michelina's Fettuccine Alfredo Frozen Meal",
      brand: "Michelina's",
      size: "9 oz",
      priceValue: 1.69,
      priceLabel: "$1.69",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    expect(scoreProductMatch(ingredient, direct)).toBeGreaterThan(scoreProductMatch(ingredient, absurd))
    expect(scoreProductMatch(ingredient, absurd)).toBe(0)
  })

  it("rejects beverage products for fresh produce ingredients", () => {
    const ingredient = {
      name: "lime",
      normalizedName: "lime",
      quantity: 2,
      unit: null,
      category: "produce" as const,
      required: true,
      pantryItem: false,
      notes: null,
    }

    const direct = {
      productId: "1",
      upc: "1",
      description: "Fresh Limes - Each",
      brand: "Fresh Citrus",
      size: "1 each",
      priceValue: null,
      priceLabel: null,
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    const absurd = {
      productId: "2",
      upc: "2",
      description: "Slice Lemon Lime Soda",
      brand: "Slice",
      size: "12 fl oz",
      priceValue: 2.49,
      priceLabel: "$2.49",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    expect(scoreProductMatch(ingredient, direct)).toBeGreaterThan(scoreProductMatch(ingredient, absurd))
    expect(scoreProductMatch(ingredient, absurd)).toBe(0)
  })

  it("rejects dessert products for alcohol ingredients", () => {
    const ingredient = {
      name: "amaretto liqueur",
      normalizedName: "amaretto liqueur",
      quantity: 1,
      unit: "bottle",
      category: "beverage" as const,
      required: true,
      pantryItem: false,
      notes: null,
    }

    const direct = {
      productId: "1",
      upc: "1",
      description: "Disaronno Originale Amaretto Liqueur",
      brand: "Disaronno",
      size: "750 ml",
      priceValue: 29.99,
      priceLabel: "$29.99",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    const absurd = {
      productId: "2",
      upc: "2",
      description: "Private Selection Amaretto Cherry Cordial Ice Cream Tub",
      brand: "Private Selection",
      size: "48 oz",
      priceValue: 5.99,
      priceLabel: "$5.99",
      imageUrl: null,
      modality: "PICKUP" as const,
    }

    expect(scoreProductMatch(ingredient, direct)).toBeGreaterThan(scoreProductMatch(ingredient, absurd))
    expect(scoreProductMatch(ingredient, absurd)).toBe(0)
  })
})

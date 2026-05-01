import { describe, expect, it } from "vitest"
import { estimateCartQuantity } from "@/lib/kroger/quantityEstimator"

describe("estimateCartQuantity", () => {
  it("buys enough meat packages to cover the required pounds", () => {
    const quantity = estimateCartQuantity(
      {
        normalizedName: "chicken breast",
        quantity: 2,
        unit: "lb",
        category: "meat",
      },
      {
        size: "1 lb",
      },
    )

    expect(quantity).toBe(2)
  })

  it("keeps a single milk carton when one package covers the recipe", () => {
    const quantity = estimateCartQuantity(
      {
        normalizedName: "milk",
        quantity: 2,
        unit: "cups",
        category: "dairy",
      },
      {
        size: "1/2 gal",
      },
    )

    expect(quantity).toBe(1)
  })

  it("uses count-based package sizing for eggs", () => {
    const quantity = estimateCartQuantity(
      {
        normalizedName: "eggs",
        quantity: 18,
        unit: "ct",
        category: "dairy",
      },
      {
        size: "12 ct",
      },
    )

    expect(quantity).toBe(2)
  })
})

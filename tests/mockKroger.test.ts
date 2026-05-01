import { describe, expect, it } from "vitest"
import { mockAddToCart, mockSearchProducts } from "@/lib/kroger/mockKroger"

describe("mockKroger", () => {
  it("returns product candidates and mock cart results", async () => {
    const products = await mockSearchProducts("ground beef")
    const result = await mockAddToCart([{ upc: products[0].upc, quantity: 1, modality: "PICKUP" }])

    expect(products.length).toBeGreaterThan(0)
    expect(result.authenticated).toBe(true)
    expect(result.results[0].success).toBe(true)
  })
})

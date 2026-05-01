import { describe, expect, it } from "vitest"
import { normalizeCraving } from "@/lib/craving/normalizeCraving"

describe("normalizeCraving", () => {
  it("maps the demo prompt to the canonical cheeseburger dish", () => {
    const result = normalizeCraving("I'm craving an American cheeseburger")

    expect(result.canonicalDish).toBe("American cheeseburger")
    expect(result.searchQuery).toBe("American cheeseburger recipe")
  })
})

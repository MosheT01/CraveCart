import { describe, expect, it } from "vitest"
import { buildKrogerSearchQueries } from "@/lib/kroger/searchQueries"

describe("buildKrogerSearchQueries", () => {
  it("adds singular and simplified fallbacks for produce", () => {
    const queries = buildKrogerSearchQueries({
      query: "Yellow Onions",
      ingredientName: "Yellow Onions",
      category: "produce",
    })

    expect(queries).toContain("yellow onions")
    expect(queries).toContain("yellow onion")
    expect(queries).toContain("onion")
  })

  it("normalizes descriptive cheese queries into a simpler grocery term", () => {
    const queries = buildKrogerSearchQueries({
      query: "Shredded Cheddar Cheese",
      ingredientName: "Shredded Cheddar Cheese",
      category: "dairy",
    })

    expect(queries).toContain("shredded cheddar cheese")
    expect(queries).toContain("cheddar cheese")
  })

  it("collapses alternative ingredient wording into concrete grocery terms", () => {
    const cilantroQueries = buildKrogerSearchQueries({
      query: "Fresh Coriander or Cilantro",
      ingredientName: "Fresh Coriander or Cilantro",
      category: "produce",
    })

    const onionQueries = buildKrogerSearchQueries({
      query: "Brown or Yellow Onion",
      ingredientName: "Brown or Yellow Onion",
      category: "produce",
    })

    expect(cilantroQueries).toContain("cilantro")
    expect(onionQueries).toContain("yellow onion")
    expect(onionQueries).toContain("onion")
  })
})

import { describe, expect, it } from "vitest"
import { getFallbackRecipe } from "@/lib/recipes/fallbackRecipes"

describe("fallbackRecipes", () => {
  it("returns the seeded cheeseburger fallback recipe", () => {
    const recipe = getFallbackRecipe("American cheeseburger")

    expect(recipe?.dish).toBe("American cheeseburger")
    expect(recipe?.structured.ingredients.length).toBeGreaterThan(0)
  })

  it("includes the hungarian pizza fallback recipe", () => {
    const recipe = getFallbackRecipe("Hungarian Pizza")

    expect(recipe?.dish).toBe("Hungarian Pizza")
    expect(recipe?.structured.ingredients.some((ingredient) => ingredient.normalizedName === "smoked sausage")).toBe(true)
  })
})

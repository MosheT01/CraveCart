import { beforeEach, describe, expect, it, vi } from "vitest"

const callJsonLlm = vi.fn()

vi.mock("@/lib/llm/client", () => ({
  callJsonLlm,
}))

describe("extractIngredients", () => {
  beforeEach(() => {
    vi.resetModules()
    callJsonLlm.mockReset()
    process.env.GEMINI_API_KEY = "test-key"
  })

  it("retries once when the first response is invalid", async () => {
    callJsonLlm
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(
        JSON.stringify({
          dish: "American cheeseburger",
          servings: 4,
          ingredients: [
            {
              name: "ground beef",
              normalizedName: "ground beef",
              quantity: 2,
              unit: "lb",
              category: "meat",
              required: true,
              pantryItem: false,
              notes: null,
            },
          ],
          pantryAssumptions: [],
          instructionsSummary: "Cook and assemble.",
        }),
      )

    const { extractIngredients } = await import("@/lib/llm/extractIngredients")
    const result = await extractIngredients({
      recipeText: "ground beef and buns",
      dish: "American cheeseburger",
      servings: 4,
      fallbackStructuredRecipe: null,
    })

    expect(result.dish).toBe("American cheeseburger")
    expect(callJsonLlm).toHaveBeenCalledTimes(2)
  })
})

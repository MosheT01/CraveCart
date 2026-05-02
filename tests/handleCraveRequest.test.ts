import { beforeEach, describe, expect, it, vi } from "vitest"

const runAgentTurn = vi.fn()

vi.mock("@/lib/agent/runAgentTurn", () => ({
  runAgentTurn,
}))

describe("handleCraveRequest", () => {
  beforeEach(() => {
    vi.resetModules()
    runAgentTurn.mockReset()
  })

  it("maps a cart artifact into the legacy cart_ready response shape", async () => {
    runAgentTurn.mockResolvedValue({
      assistantMessage: "Your Kroger cart is ready.",
      activity: [],
      artifact: null,
      needsAuth: false,
      authUrl: null,
      cart: {
        kind: "cart",
        status: "cart_ready",
        dish: "American cheeseburger",
        retailer: "Kroger",
        itemsAdded: 2,
        estimatedTotal: "$10.78",
        items: [
          {
            ingredient: "ground beef",
            selectedProduct: "Kroger Ground Beef 80/20",
            quantity: 1,
            unit: "package",
            price: "$7.99",
            upc: "123",
          },
        ],
        openCartUrl: "https://www.kroger.com/cart",
        unmatchedIngredients: [],
        recipeSource: "fallback_recipe",
        video: {
          title: "Best American Cheeseburger",
          url: "https://www.youtube.com/watch?v=demo",
          channel: "Demo Chef",
        },
      },
    })

    const { handleCraveRequest } = await import("@/lib/api/handleCraveRequest")
    const response = await handleCraveRequest(
      {
        craving: "I'm craving an American cheeseburger",
        servings: 4,
      },
      "session-123",
    )

    expect(response.status).toBe("cart_ready")
    if (response.status === "cart_ready") {
      expect(response.dish).toBe("American cheeseburger")
      expect(response.hiddenDetails.recipeSource).toBe("fallback_recipe")
      expect(response.cart.itemsAdded).toBe(2)
    }
  })

  it("returns needs_kroger_auth when the agent says auth is required", async () => {
    runAgentTurn.mockResolvedValue({
      assistantMessage: "Connect Kroger first.",
      activity: [],
      artifact: null,
      cart: null,
      needsAuth: true,
      authUrl: "/auth/kroger",
    })

    const { handleCraveRequest } = await import("@/lib/api/handleCraveRequest")
    const response = await handleCraveRequest(
      {
        craving: "buy milk",
        servings: 1,
      },
      "session-123",
    )

    expect(response).toEqual({
      status: "needs_kroger_auth",
      authUrl: "/auth/kroger",
    })
  })

  it("maps unknown cart source to video_metadata for legacy responses", async () => {
    runAgentTurn.mockResolvedValue({
      assistantMessage: "Your Kroger cart is ready.",
      activity: [],
      artifact: null,
      needsAuth: false,
      authUrl: null,
      cart: {
        kind: "cart",
        status: "cart_ready",
        dish: "American cheeseburger",
        retailer: "Kroger",
        itemsAdded: 1,
        estimatedTotal: "$8.49",
        items: [
          {
            ingredient: "ground beef",
            selectedProduct: "Kroger Ground Beef 80/20",
            quantity: 1,
            unit: "package",
            price: "$8.49",
            upc: "123",
          },
        ],
        openCartUrl: "https://www.kroger.com/cart",
        unmatchedIngredients: [],
        recipeSource: "none",
        video: {
          title: "Best American Cheeseburger",
          url: "https://www.youtube.com/watch?v=demo",
          channel: "Demo Chef",
        },
      },
    })

    const { handleCraveRequest } = await import("@/lib/api/handleCraveRequest")
    const response = await handleCraveRequest(
      {
        craving: "I'm craving an American cheeseburger",
        servings: 4,
      },
      "session-123",
    )

    expect(response.status).toBe("cart_ready")
    if (response.status === "cart_ready") {
      expect(response.hiddenDetails.recipeSource).toBe("video_metadata")
    }
  })
})

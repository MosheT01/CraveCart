import { runAgentTurn } from "@/lib/agent/runAgentTurn"
import { normalizeCraving } from "@/lib/craving/normalizeCraving"
import { devLog } from "@/lib/dev"
import type { CraveResponse, RunCravePipelineInput } from "@/lib/types"

export async function handleCraveRequest(input: RunCravePipelineInput, sessionId: string): Promise<CraveResponse> {
  try {
    const normalized = normalizeCraving(input.craving)
    const assistantRequest = `Use a cooking video to buy groceries for ${normalized.canonicalDish} for ${input.servings} servings. Search YouTube for a relevant recipe, use the transcript when available, fall back to the internal recipe if the transcript is unavailable, extract structured ingredients with quantities, skip pantry staples, match Kroger products, and add enough retail units to cover the recipe to my cart.`

    const result = await runAgentTurn({
      messages: [{ role: "user", content: assistantRequest }],
      sessionId,
    })

    if (result.needsAuth) {
      return {
        status: "needs_kroger_auth",
        authUrl: "/auth/kroger",
      }
    }

    if (!result.cart) {
      return {
        status: "error",
        message: "The agent completed without a cart-ready result.",
      }
    }

    const sharedPayload = {
      dish: result.cart.dish,
      video: result.cart.video ?? {
        title: `${result.cart.dish} recipe`,
        url: "https://www.youtube.com",
        channel: "CraveCart",
      },
      cart: {
        retailer: result.cart.retailer,
        itemsAdded: result.cart.itemsAdded,
        estimatedTotal: result.cart.estimatedTotal,
        items: result.cart.items,
        openCartUrl: result.cart.openCartUrl,
      },
      hiddenDetails: {
        recipeSource: result.cart.recipeSource === "none" ? "fallback_recipe" : result.cart.recipeSource,
        unmatchedIngredients: result.cart.unmatchedIngredients,
      },
    }

    if (result.cart.status === "partial_cart_ready") {
      return {
        status: "partial_cart_ready",
        message: result.cart.message ?? "Some ingredients could not be matched.",
        ...sharedPayload,
      }
    }

    return {
      status: "cart_ready",
      ...sharedPayload,
    }
  } catch (error) {
    devLog("crave_wrapper_error", error)
    return {
      status: "error",
      message: error instanceof Error ? error.message : "CraveCart hit an unexpected error.",
    }
  }
}

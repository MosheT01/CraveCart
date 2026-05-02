import { describe, expect, it, vi } from "vitest"
import { AgentToolRuntime } from "@/lib/agent/toolRuntime"
import type { AgentSessionState, StoredPendingSelection } from "@/lib/agent/sessionState"
import type { VideoArtifact } from "@/lib/types"

describe("AgentToolRuntime", () => {
  it("preserves the last video artifact after cart creation so transcript follow-ups still have source context", async () => {
    const videoArtifact: VideoArtifact = {
      kind: "video",
      video: {
        title: "Chicken Fettuccine Alfredo Recipe - Easy Dinner",
        url: "https://www.youtube.com/watch?v=demo",
        channel: "Natashas Kitchen",
      },
      transcriptAvailable: true,
      transcriptStatus: "available",
      transcriptMessage: undefined,
      recipeSource: "youtube_transcript",
      summary: "Transcript available for Chicken Fettuccine Alfredo Recipe - Easy Dinner.",
    }

    const initialState: AgentSessionState = {
      latestArtifact: videoArtifact,
      latestCart: null,
      latestDish: "Chicken Fettuccine Alfredo",
      latestRecipeSource: "youtube_transcript",
      latestRecipeText: "Transcript-backed chicken alfredo recipe text",
      latestFallbackStructuredRecipe: null,
      latestExtractedRecipe: null,
      pendingSelections: [] as StoredPendingSelection[],
      unmatchedIngredients: [],
      updatedAt: Date.now(),
    }

    const runtime = new AgentToolRuntime(
      [{ role: "user", content: "buy the groceries for this recipe" }],
      "session-tool-runtime",
      initialState,
    )

    ;(runtime as unknown as { mcpClients: { callKrogerTool: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } }).mcpClients = {
      callKrogerTool: vi.fn().mockResolvedValue({
        data: {
          ok: true,
          authenticated: true,
          results: [{ upc: "123", quantity: 1, success: true }],
          openCartUrl: "https://www.kroger.com/cart",
        },
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }

    await runtime.execute("add_kroger_items_to_cart", {
      dish: "Chicken Fettuccine Alfredo",
      recipeSource: "youtube_transcript",
      unmatchedIngredients: [],
      video: {
        title: videoArtifact.video.title,
        url: videoArtifact.video.url,
        channel: videoArtifact.video.channel,
      },
      items: [
        {
          ingredient: "Chicken Breast",
          upc: "123",
          selectedProduct: "Kroger Chicken Breast",
          quantity: 1,
          unit: "package",
          price: "$9.99",
          priceValue: 9.99,
          modality: "PICKUP",
        },
      ],
    })

    const nextState = runtime.createSessionState()

    expect(nextState.latestArtifact?.kind).toBe("video")
    expect(nextState.latestArtifact).toEqual(videoArtifact)
    expect(nextState.latestCart?.kind).toBe("cart")
    expect(nextState.latestCart?.recipeSource).toBe("youtube_transcript")
  })
})

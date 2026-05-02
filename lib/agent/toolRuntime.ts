import { AgentMcpClients } from "@/lib/agent/mcpClient"
import { getMutationPermissionState } from "@/lib/agent/intent"
import type { AgentSessionState } from "@/lib/agent/sessionState"
import { readEnv } from "@/lib/env"
import { formatUsd } from "@/lib/format"
import { scoreProductMatch } from "@/lib/kroger/productMatcher"
import { estimateCartQuantity } from "@/lib/kroger/quantityEstimator"
import { buildKrogerSearchQueries } from "@/lib/kroger/searchQueries"
import { extractIngredients } from "@/lib/llm/extractIngredients"
import { getFallbackRecipe as loadFallbackRecipe } from "@/lib/recipes/fallbackRecipes"
import type {
  AgentArtifact,
  CartArtifact,
  ChatMessage,
  ExtractedRecipe,
  ExtractedIngredient,
  IngredientCategory,
  KrogerProduct,
  RecipeSource,
  ToolTraceEntry,
  VideoArtifact,
} from "@/lib/types"

interface ToolExecutionOutcome {
  response: Record<string, unknown>
  summary: string
  artifact?: AgentArtifact | null
  needsAuth?: boolean
  authUrl?: "/auth/kroger"
  /** When needsAuth, shown as assistant text + needs_kroger_auth event (defaults in runAgentTurn if omitted). */
  authUserMessage?: string
}

interface ToolDeclaration {
  name: string
  description: string
  parametersJsonSchema: Record<string, unknown>
}

interface YoutubeSearchResult {
  ok: boolean
  message?: string
  videos: Array<{
    videoId: string
    title: string
    url: string
    channel: string
    description: string
    duration: string | null
    durationSeconds: number | null
    score: number
    transcriptAvailable?: boolean
    transcriptStatus?: "available" | "unavailable" | "blocked" | "error"
    transcriptMessage?: string
  }>
}

interface YoutubeContextResult {
  ok: boolean
  video: {
    videoId: string
    title: string
    url: string
    channel: string
    description: string
  }
  transcriptAvailable: boolean
  transcriptStatus?: "available" | "unavailable" | "blocked" | "error"
  transcript?: string
  transcriptMessage?: string
}

interface KrogerSearchResult {
  ok: boolean
  message?: string
  products: KrogerProduct[]
}

interface KrogerAuthStatusResult {
  ok: boolean
  authenticated: boolean
  configured: boolean
  authUrl: "/auth/kroger"
}

interface KrogerCartAddResult {
  ok: boolean
  authenticated: boolean
  results: Array<{
    upc: string
    quantity: number
    success: boolean
    message?: string
  }>
  openCartUrl: string
}

/** MCP may return {}, non-JSON text, or omit `products` — avoid throwing on `.length`. */
function normalizeKrogerSearchPayload(data: unknown): KrogerSearchResult {
  if (!data || typeof data !== "object") {
    return { ok: false, products: [] }
  }
  const record = data as Record<string, unknown>
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.text === "string"
        ? record.text
        : undefined
  return {
    ok: Boolean(record.ok),
    message,
    products: Array.isArray(record.products) ? (record.products as KrogerProduct[]) : [],
  }
}

interface PendingCartSelection {
  ingredient: string
  upc: string
  selectedProduct: string
  quantity: number
  unit: string
  price: string
  priceValue: number
  modality: "PICKUP" | "DELIVERY"
}

const MIN_PRODUCT_CONFIDENCE = 0.24
const TOOL_RETRY_MAX = 2
const TRANSIENT_ERROR_PATTERNS = [
  "timeout",
  "network",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "rate limit",
  "429",
  "503",
  "temporary",
]

function isTransientToolError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error)
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => errorMessage.toLowerCase().includes(pattern.toLowerCase()))
}

export class AgentToolRuntime {
  private readonly mcpClients = new AgentMcpClients()
  private readonly permissionState
  private readonly requestedServings
  private readonly sessionState: AgentSessionState | null
  private latestArtifact: AgentArtifact | null = null
  private latestCart: CartArtifact | null = null
  private latestDish = "Groceries"
  private latestRecipeSource: RecipeSource | "none" = "none"
  private latestRecipeText: string | null = null
  private latestFallbackStructuredRecipe: ExtractedRecipe | null = null
  private latestExtractedRecipe: ExtractedRecipe | null = null
  private readonly pendingSelections = new Map<string, PendingCartSelection>()
  private readonly unmatchedIngredients = new Set<string>()

  constructor(
    private readonly messages: ChatMessage[],
    private readonly sessionId: string,
    initialState: AgentSessionState | null = null,
  ) {
    this.permissionState = getMutationPermissionState(messages)
    this.requestedServings = extractRequestedServings(messages)
    this.sessionState = initialState

    if (initialState) {
      this.latestArtifact = initialState.latestArtifact
      this.latestCart = initialState.latestCart
      this.latestDish = initialState.latestDish
      this.latestRecipeSource = initialState.latestRecipeSource
      this.latestRecipeText = initialState.latestRecipeText
      this.latestFallbackStructuredRecipe = initialState.latestFallbackStructuredRecipe
      this.latestExtractedRecipe = initialState.latestExtractedRecipe

      for (const selection of initialState.pendingSelections) {
        this.pendingSelections.set(normalizeIngredientKey(selection.ingredient), selection)
      }

      for (const ingredient of initialState.unmatchedIngredients) {
        this.unmatchedIngredients.add(ingredient)
      }
    }
  }

  getDeclarations() {
    const declarations: ToolDeclaration[] = [
      {
        name: "search_youtube_videos",
        description: "Search YouTube for relevant cooking or food videos. The service probes up to five likely candidates for transcripts; if none of those five have transcripts, it falls back to the most relevant results.",
        parametersJsonSchema: {
        type: "object",
        properties: {
            query: { type: "string", description: "The YouTube search query." },
            maxResults: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["query"],
        },
      },
      {
        name: "get_video_context",
        description:
          "Fetch a YouTube video's metadata and transcript when available. Use dishHint when you may need a fallback recipe for a known craving.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            videoId: { type: "string" },
            dishHint: { type: "string" },
          },
          required: ["videoId"],
        },
      },
      {
        name: "get_fallback_recipe",
        description:
          "Get a curated fallback recipe for seeded demo dishes when a YouTube transcript is unavailable or unreliable.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            dish: { type: "string" },
          },
          required: ["dish"],
        },
      },
      {
        name: "extract_recipe_ingredients",
        description:
          "Extract a structured grocery ingredient list, with recipe quantities and units, from the current recipe or transcript context.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            servings: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
      {
        name: "get_kroger_auth_status",
        description: "Check whether the current user session is connected to Kroger.",
        parametersJsonSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_kroger_products",
        description:
          "Search Kroger products for a grocery ingredient and return a deterministically ranked selected product plus alternatives.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            ingredientName: { type: "string" },
            ingredientQuantity: { type: "number" },
            ingredientUnit: { type: "string" },
            category: {
              type: "string",
              enum: ["meat", "dairy", "produce", "bakery", "pantry", "frozen", "beverage", "other"],
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_kroger_cart_summary",
        description: "Get the most recent cart mutation summary for this session.",
        parametersJsonSchema: {
          type: "object",
          properties: {},
        },
      },
    ]

    if (this.permissionState.allowCartMutation) {
      declarations.push({
        name: "add_kroger_items_to_cart",
        description:
          "Add selected Kroger UPCs to the current user's cart. Include the dish, matched line items, and any known unmatched ingredients so the final cart summary is complete.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            dish: { type: "string" },
            recipeSource: { type: "string", enum: ["youtube_transcript", "fallback_recipe", "video_metadata", "none"] },
            unmatchedIngredients: {
              type: "array",
              items: { type: "string" },
            },
            video: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                channel: { type: "string" },
              },
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredient: { type: "string" },
                  upc: { type: "string" },
                  selectedProduct: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  price: { type: "string" },
                  priceValue: { type: "number" },
                  modality: { type: "string", enum: ["PICKUP", "DELIVERY"] },
                },
                required: ["ingredient", "upc", "selectedProduct"],
              },
            },
          },
          required: ["dish", "items"],
        },
      })
    }

    return declarations
  }

  getPermissionState() {
    return this.permissionState
  }

  getLatestArtifact() {
    return this.latestArtifact
  }

  getLatestCart() {
    return this.latestCart
  }

  getLatestRecipeText() {
    return this.latestRecipeText
  }

  hasRecipeContext() {
    return Boolean(this.latestExtractedRecipe || this.latestRecipeText || this.latestFallbackStructuredRecipe)
  }

  getPendingSelectionCount() {
    return this.pendingSelections.size
  }

  createSessionState(): Omit<AgentSessionState, "updatedAt"> {
    return {
      latestArtifact: this.latestArtifact,
      latestCart: this.latestCart,
      latestDish: this.latestDish,
      latestRecipeSource: this.latestRecipeSource,
      latestRecipeText: this.latestRecipeText,
      latestFallbackStructuredRecipe: this.latestFallbackStructuredRecipe,
      latestExtractedRecipe: this.latestExtractedRecipe,
      pendingSelections: Array.from(this.pendingSelections.values()),
      unmatchedIngredients: Array.from(this.unmatchedIngredients),
      userPreferences: this.sessionState?.userPreferences ?? null,
      preferencesConfirmed: this.sessionState?.preferencesConfirmed ?? false,
    }
  }

  buildCarryoverContextPrompt(latestUserMessage: string) {
    if (!this.latestDish && !this.latestRecipeText && !this.latestExtractedRecipe && !this.latestCart) {
      return null
    }

    const ingredientPreview = this.latestExtractedRecipe?.ingredients
      .filter((ingredient) => !ingredient.pantryItem)
      .slice(0, 18)
      .map((ingredient) =>
        ingredient.quantity != null && ingredient.unit
          ? `${ingredient.name} (${ingredient.quantity} ${ingredient.unit})`
          : ingredient.name,
      )
      .join(", ")

    const remaining = this.getRemainingIngredientNames()
    const lastVideo = this.latestArtifact?.kind === "video" ? this.latestArtifact.video : this.latestCart?.video

    return [
      "Server context from previous turns:",
      `- Latest user follow-up: ${latestUserMessage}`,
      `- Active dish: ${this.latestDish || this.latestCart?.dish || "unknown"}.`,
      lastVideo ? `- Current recipe video: ${lastVideo.title} by ${lastVideo.channel}.` : "",
      this.latestRecipeSource !== "none" ? `- Recipe source: ${this.latestRecipeSource}.` : "",
      this.latestExtractedRecipe
        ? `- Structured grocery ingredients are already available (${this.latestExtractedRecipe.ingredients.filter((ingredient) => !ingredient.pantryItem).length} non-pantry ingredients).`
        : "",
      ingredientPreview ? `- Known grocery ingredients: ${ingredientPreview}.` : "",
      remaining.length > 0 ? `- Ingredients still not searched or resolved: ${remaining.join(", ")}.` : "",
      this.latestCart
        ? `- Last cart status: ${this.latestCart.status} with ${this.latestCart.itemsAdded} matched items and unmatched ingredients: ${this.latestCart.unmatchedIngredients.join(", ") || "none"}.`
        : "- The current recipe has not been fully added to the cart yet.",
      "If the user's latest message refers to them, it, the rest, all the ingredients, or that video, continue from this saved context instead of starting over.",
    ]
      .filter(Boolean)
      .join("\n")
  }

  buildShoppingContinuationPrompt() {
    const remainingIngredients = this.getRemainingIngredientNames()
    if (!this.permissionState.allowCartMutation || (this.latestCart && remainingIngredients.length === 0 && this.pendingSelections.size === 0)) {
      return null
    }

    const context = this.latestRecipeText
      ? `Recipe context:\n${this.latestRecipeText.slice(0, 4000)}`
      : this.latestArtifact?.kind === "video"
        ? `Video context:\n${this.latestArtifact.summary}`
        : "Use the recipe or video context already in the conversation."

    return [
      "Server note: the user explicitly asked you to buy groceries in this same turn, and you have not completed the grocery workflow yet.",
      "Continue now. Do not ask whether to proceed.",
      context,
      "First call extract_recipe_ingredients so you have structured ingredients with quantities and units.",
      "Skip pantry staples, search Kroger for the remaining items, preserve the extracted quantity/unit when you call search_kroger_products, and add enough package quantity to cover the recipe.",
      "Search all remaining grocery ingredients first, then call add_kroger_items_to_cart once at the end with the full matched batch.",
      "If a match is weak or absurd, leave that ingredient unmatched instead of forcing a bad product.",
    ].join("\n\n")
  }

  buildPostCartFollowupPrompt() {
    if (!this.latestCart) {
      return null
    }

    const video = this.latestArtifact?.kind === "video" ? this.latestArtifact.video : undefined
    const matchedItems = this.latestCart.items
      .map((item) => `- ${item.ingredient}: ${item.selectedProduct}`)
      .join("\n")
    const unmatched = this.latestCart.unmatchedIngredients.length > 0 ? this.latestCart.unmatchedIngredients.join(", ") : "none"
    const recipeSnippet = this.latestRecipeText?.slice(0, 4000)

    return [
      "Server note: the cart update has already completed. Do not call any more tools. Respond directly to the user now.",
      `Dish: ${this.latestCart.dish}.`,
      video ? `Recipe video: ${video.title} by ${video.channel}.` : "",
      recipeSnippet ? `Recipe source text:\n${recipeSnippet}` : "",
      "The user asked for recipe guidance and groceries.",
      "Give concise step-by-step instructions for making the dish at home. Then mention the cart status in one short paragraph.",
      `Matched cart items:\n${matchedItems}`,
      `Unmatched ingredients: ${unmatched}.`,
    ]
      .filter(Boolean)
      .join("\n\n")
  }

  buildLocalRecipeWrapUp() {
    if (!this.latestCart) {
      return null
    }

    const cart = this.latestCart
    const recipeContext = `${cart.dish} ${cart.video?.title ?? ""} ${this.latestRecipeText ?? ""}`
    const isPizzaLike = /\b(pizza|langall[oó]|keny[eé]rl[áa]ngos)\b/i.test(recipeContext)
    const bakeTemperature = extractBakeTemperature(this.latestRecipeText)
    const bakeDuration = extractBakeDuration(this.latestRecipeText)

    const doughItem = findCartItem(cart, /\b(dough|crust)\b/i)
    const sauceItem = findCartItem(cart, /\bsauce\b/i)
    const cheeseItems = findCartItems(cart, /\bcheese\b/i)
    const meatItems = findCartItems(cart, /\b(sausage|ham|bacon|beef|chicken|pork|pepperoni)\b/i)
    const produceItems = findCartItems(cart, /\b(onion|pepper|tomato|lettuce|pickle|garlic)\b/i)

    const steps: string[] = []
    if (isPizzaLike) {
      steps.push(
        `1. Preheat your oven${bakeTemperature ? ` to about ${bakeTemperature}` : ""} and get a baking sheet or pizza tray ready.`,
        `2. Stretch the ${doughItem?.ingredient ?? "pizza dough"} into a thin round or rectangle on the tray.`,
        `3. Spread the ${sauceItem?.ingredient ?? "pizza sauce"} evenly over the dough, leaving a small border around the edges.`,
        `4. Add the toppings in an even layer${meatItems.length > 0 ? `: ${formatIngredientList(meatItems.map((item) => item.ingredient))}` : ""}${produceItems.length > 0 ? `, plus ${formatIngredientList(produceItems.map((item) => item.ingredient))}` : ""}.`,
        `5. Finish with ${cheeseItems.length > 0 ? formatIngredientList(cheeseItems.map((item) => item.ingredient)) : "cheese"} and bake${bakeDuration ? ` for ${bakeDuration}` : " until the crust is golden and the cheese is melted"}.`,
        "6. Let it cool for a minute or two, slice, and serve hot.",
      )
    } else {
      steps.push(
        `1. Gather the ingredients for ${cart.dish} and prep any chopping, grating, or measuring before you start cooking.`,
        `2. Cook the main components first${meatItems.length > 0 ? `, especially ${formatIngredientList(meatItems.map((item) => item.ingredient))}` : ""}, so they are ready to assemble.`,
        `3. Add the supporting ingredients${produceItems.length > 0 ? ` like ${formatIngredientList(produceItems.map((item) => item.ingredient))}` : ""} and season to taste.`,
        `4. Finish with ${cheeseItems.length > 0 ? formatIngredientList(cheeseItems.map((item) => item.ingredient)) : "the final toppings or garnish"} and cook until everything is hot and well combined.`,
        "5. Plate and serve right away.",
      )
    }

    const cartStatus = cart.status === "partial_cart_ready"
      ? `I added ${cart.itemsAdded} item(s) to your Kroger cart. I could not confidently match ${cart.unmatchedIngredients.join(", ")}.`
      : `I added ${cart.itemsAdded} item(s) to your Kroger cart and it is ready to open.`

    return `Here’s a practical way to make ${cart.dish} at home:\n\n${steps.join("\n")}\n\n${cartStatus}`
  }

  shouldAutoFinalizeCart() {
    return this.permissionState.allowCartMutation && this.pendingSelections.size > 0
  }

  async autoFinalizeCartFromSelections(): Promise<ToolExecutionOutcome | null> {
    if (!this.shouldAutoFinalizeCart()) {
      return null
    }

    const video = this.latestArtifact?.kind === "video" ? this.latestArtifact.video : undefined
    return this.addKrogerItemsToCart({
      dish: this.latestDish,
      recipeSource: this.latestRecipeSource,
      unmatchedIngredients: Array.from(this.unmatchedIngredients),
      video,
      items: Array.from(this.pendingSelections.values()),
    })
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    let lastError: unknown = null
    let attempts = 0

    while (attempts <= TOOL_RETRY_MAX) {
      attempts += 1
      try {
        const outcome = await this.executeTool(name, args)
        if (attempts > 1) {
          return {
            ...outcome,
            summary: `[Retry ${attempts - 1}] ${outcome.summary}`,
          }
        }
        return outcome
      } catch (error) {
        lastError = error
        const isTransient = isTransientToolError(error)
        if (!isTransient || attempts > TOOL_RETRY_MAX) {
          break
        }
        await this.delay(300 * attempts)
      }
    }

    return this.handleToolFailure(name, args, lastError)
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    switch (name) {
      case "search_youtube_videos":
        return this.searchYoutubeVideos(args)
      case "get_video_context":
        return this.getVideoContext(args)
      case "get_fallback_recipe":
        return this.getFallbackRecipe(args)
      case "extract_recipe_ingredients":
        return this.extractRecipeIngredients(args)
      case "get_kroger_auth_status":
        return this.getKrogerAuthStatus()
      case "search_kroger_products":
        return this.searchKrogerProducts(args)
      case "add_kroger_items_to_cart":
        return this.addKrogerItemsToCart(args)
      case "get_kroger_cart_summary":
        return this.getKrogerCartSummary()
      default:
        return {
          response: { ok: false, message: `Unknown tool: ${name}` },
          summary: `Tool ${name} is not available.`,
        }
    }
  }

  private handleToolFailure(name: string, args: Record<string, unknown>, error: unknown): ToolExecutionOutcome {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const fallbackOutcome = this.getFallbackForTool(name)
    if (fallbackOutcome) {
      return {
        ...fallbackOutcome,
        summary: `[Failed after retries: ${errorMessage}] ${fallbackOutcome.summary}`,
      }
    }
    return {
      response: { ok: false, error: errorMessage, tool: name },
      summary: `Tool ${name} failed after ${TOOL_RETRY_MAX + 1} attempts: ${errorMessage}`,
    }
  }

  private getFallbackForTool(name: string): ToolExecutionOutcome | null {
    switch (name) {
      case "search_youtube_videos":
        return {
          response: { ok: false, message: "YouTube search unavailable. Try a different search term." },
          summary: "YouTube search failed, returned fallback response.",
        }
      case "get_video_context":
        return {
          response: { ok: false, message: "Video context unavailable. Use search to find another video." },
          summary: "Video context fetch failed, returned fallback response.",
        }
      case "search_kroger_products":
        return {
          response: { ok: false, message: "Kroger search unavailable. This ingredient may not be in stock." },
          summary: "Kroger search failed for ingredient.",
        }
      case "add_kroger_items_to_cart":
        return {
          response: { ok: false, message: "Cart update failed. Please try again or reconnect Kroger." },
          summary: "Cart mutation failed after retries.",
        }
      default:
        return null
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async close() {
    await this.mcpClients.close()
  }

  private async searchYoutubeVideos(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    const query = String(args.query ?? "").trim()
    const maxResults = Number(args.maxResults ?? 5)
    const result = await this.mcpClients.callYoutubeTool<YoutubeSearchResult>("search_youtube_videos", {
      query,
      max_results: Number.isFinite(maxResults) ? maxResults : 5,
    })

    const first = result.data.videos[0]
    const transcriptBackedCount = result.data.videos.filter((video) => video.transcriptAvailable).length
    const transcriptSummary =
      transcriptBackedCount === 0
        ? ""
        : transcriptBackedCount === result.data.videos.length
          ? ", all transcript-backed"
          : `, ${transcriptBackedCount} transcript-backed`
    return {
      response: result.data as unknown as Record<string, unknown>,
      summary: first
        ? `Found ${result.data.videos.length} YouTube candidates${transcriptSummary}. Top result: ${first.title}.`
        : "No YouTube videos found.",
    }
  }

  private async getVideoContext(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    const videoId = String(args.videoId ?? "").trim()
    const dishHint = typeof args.dishHint === "string" ? args.dishHint.trim() : ""
    const result = await this.mcpClients.callYoutubeTool<YoutubeContextResult>("get_video_context", {
      video_id: videoId,
    })

    let recipeSource: RecipeSource | "none" = "none"
    let recipeText: string | undefined = result.data.transcript
    let fallbackStructuredRecipe: ExtractedRecipe | null = null

    if (result.data.transcriptAvailable) {
      recipeSource = "youtube_transcript"
      recipeText = buildVideoRecipeText(result.data.video, result.data.transcript)
    } else {
      recipeSource = "video_metadata"
      recipeText = buildVideoDescriptionContext(
        result.data.video,
        result.data.transcriptStatus,
        result.data.transcriptMessage,
      )
    }

    if (!result.data.transcriptAvailable && dishHint) {
      const fallback = loadFallbackRecipe(dishHint)
      if (fallback && !recipeText?.trim()) {
        recipeSource = "fallback_recipe"
        recipeText = fallback.text
        fallbackStructuredRecipe = fallback.structured
      }
    }

    if (dishHint) {
      this.resetShoppingState()
      this.latestDish = dishHint
    }
    this.latestRecipeSource = recipeSource
    this.latestRecipeText = recipeText ?? null
    this.latestFallbackStructuredRecipe = fallbackStructuredRecipe
    this.latestExtractedRecipe = null

    const transcriptStatus = result.data.transcriptStatus
    const summary = recipeSource === "youtube_transcript"
      ? `Transcript available for ${result.data.video.title}.`
      : transcriptStatus === "blocked"
        ? recipeSource === "fallback_recipe"
          ? `YouTube temporarily blocked transcript retrieval for ${result.data.video.title}; using the fallback recipe for ${dishHint}.`
          : `YouTube temporarily blocked transcript retrieval for ${result.data.video.title}; using the video title and description instead.`
      : transcriptStatus === "error"
        ? recipeSource === "fallback_recipe"
          ? `Could not retrieve the transcript for ${result.data.video.title} right now; using the fallback recipe for ${dishHint}.`
          : `Could not retrieve the transcript for ${result.data.video.title} right now; using the video title and description instead.`
      : recipeSource === "fallback_recipe"
        ? `Transcript unavailable for ${result.data.video.title}; using the fallback recipe for ${dishHint}.`
        : `Transcript unavailable for ${result.data.video.title}; inferring from the video title and description.`

    const artifact: VideoArtifact = {
      kind: "video",
      video: {
        title: result.data.video.title,
        url: result.data.video.url,
        channel: result.data.video.channel,
      },
      transcriptAvailable: result.data.transcriptAvailable,
      transcriptStatus: result.data.transcriptStatus,
      transcriptMessage: result.data.transcriptMessage,
      recipeSource,
      summary: recipeText?.slice(0, 280) ?? result.data.video.description ?? summary,
    }

    const response = {
      ...result.data,
      recipeSource,
      recipeText,
      fallbackDish: recipeSource === "fallback_recipe" ? dishHint : undefined,
    }

    this.latestArtifact = artifact

    return {
      response,
      summary,
      artifact,
    }
  }

  private async getFallbackRecipe(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    const dish = String(args.dish ?? "").trim()
    const fallback = loadFallbackRecipe(dish)

    if (!fallback) {
      return {
        response: {
          ok: false,
          found: false,
          message: `No fallback recipe exists for ${dish}.`,
        },
        summary: `No fallback recipe exists for ${dish}.`,
      }
    }

    this.resetShoppingState()
    this.latestDish = fallback.dish
    this.latestRecipeSource = "fallback_recipe"
    this.latestRecipeText = fallback.text
    this.latestFallbackStructuredRecipe = fallback.structured
    this.latestExtractedRecipe = fallback.structured

    return {
      response: {
        ok: true,
        found: true,
        dish: fallback.dish,
        recipeSource: "fallback_recipe",
        recipeText: fallback.text,
        structuredRecipe: fallback.structured,
      },
      summary: `Loaded the fallback recipe for ${fallback.dish}.`,
    }
  }

  private async extractRecipeIngredients(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    if (!this.latestRecipeText) {
      return {
        response: {
          ok: false,
          message: "No recipe or transcript context is loaded yet.",
        },
        summary: "No recipe context is loaded yet.",
      }
    }

    const requestedServings = normalizeServingsArg(args.servings) ?? this.requestedServings
    const extracted = await extractIngredients({
      recipeText: this.latestRecipeText,
      dish: this.latestDish,
      servings: requestedServings,
      fallbackStructuredRecipe: this.latestFallbackStructuredRecipe,
    })

    this.latestDish = extracted.dish
    this.latestExtractedRecipe = extracted

    return {
      response: {
        ok: true,
        dish: extracted.dish,
        servings: extracted.servings,
        ingredients: extracted.ingredients,
        pantryAssumptions: extracted.pantryAssumptions,
        instructionsSummary: extracted.instructionsSummary,
      },
      summary: `Extracted ${extracted.ingredients.filter((ingredient) => !ingredient.pantryItem).length} grocery ingredients for ${extracted.dish}.`,
    }
  }

  private async getKrogerAuthStatus(): Promise<ToolExecutionOutcome> {
    const result = await this.mcpClients.callKrogerTool<KrogerAuthStatusResult>("get_kroger_auth_status", {
      session_id: this.sessionId,
    })

    if (result.data.authenticated) {
      return {
        response: result.data as unknown as Record<string, unknown>,
        summary: "The user is connected to Kroger.",
      }
    }

    return {
      response: result.data as unknown as Record<string, unknown>,
      summary: "The user is not connected to Kroger yet.",
      needsAuth: true,
      authUrl: "/auth/kroger",
      authUserMessage: "Use the **Connect Kroger** button below to sign in on this site.",
    }
  }

  private async searchKrogerProducts(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    const query = String(args.query ?? "").trim()
    const ingredientName = typeof args.ingredientName === "string" ? args.ingredientName : query
    const knownIngredient = this.findKnownIngredient(ingredientName, query)
    const category = (typeof args.category === "string" ? args.category : knownIngredient?.category ?? "other") as IngredientCategory
    const quantity = typeof args.ingredientQuantity === "number" ? args.ingredientQuantity : knownIngredient?.quantity ?? null
    const unit = typeof args.ingredientUnit === "string" ? args.ingredientUnit : knownIngredient?.unit ?? null

    const ingredient: ExtractedIngredient = {
      name: knownIngredient?.name ?? ingredientName,
      normalizedName: knownIngredient?.normalizedName ?? query,
      quantity,
      unit,
      category,
      required: true,
      pantryItem: false,
      notes: knownIngredient?.notes ?? null,
    }

    const searchQueries = buildKrogerSearchQueries({
      query,
      ingredientName: ingredient.name,
      category,
    })

    let result: KrogerSearchResult = { ok: false, products: [] }
    let selected: KrogerProduct | null = null
    let alternatives: KrogerProduct[] = []
    let confidence = 0
    let selectedQuery = query
    let krogerApiMessage: string | undefined

    for (const candidateQuery of searchQueries) {
      const attempt = await this.mcpClients.callKrogerTool<KrogerSearchResult>("search_kroger_products", {
        query: candidateQuery,
        session_id: this.sessionId,
        location_id: readEnv("KROGER_LOCATION_ID"),
        limit: 10,
      })

      const payload = normalizeKrogerSearchPayload(attempt.data)
      result = payload
      selectedQuery = candidateQuery
      if (!payload.ok && payload.message) {
        krogerApiMessage = payload.message
      }

      if (!payload.products.length) {
        continue
      }

      const ranked = payload.products
        .map((product) => ({
          product,
          score: scoreProductMatch(ingredient, product),
        }))
        .sort((left, right) => right.score - left.score)

      const candidateSelection = ranked[0]?.product ?? null
      const candidateConfidence = ranked[0]?.score ?? 0
      if (candidateSelection && candidateConfidence > confidence) {
        selected = candidateSelection
        alternatives = ranked.slice(1, 4).map((entry) => entry.product)
        confidence = candidateConfidence
      }

      if (selected && confidence >= MIN_PRODUCT_CONFIDENCE) {
        break
      }
    }

    if (confidence < MIN_PRODUCT_CONFIDENCE) {
      selected = null
      alternatives = []
    }

    const selectionKey = normalizeIngredientKey(ingredient.name)
    if (selected) {
      const packageQuantity = estimateCartQuantity(ingredient, selected)
      this.pendingSelections.set(selectionKey, {
        ingredient: ingredient.name,
        upc: selected.upc,
        selectedProduct: selected.description,
        quantity: packageQuantity,
        unit: selected.size ?? "package",
        price: selected.priceLabel ?? formatUsd(selected.priceValue ?? 0),
        priceValue: selected.priceValue ?? 0,
        modality: selected.modality === "DELIVERY" ? "DELIVERY" : "PICKUP",
      })
      for (const unmatched of Array.from(this.unmatchedIngredients)) {
        if (normalizeIngredientKey(unmatched) === selectionKey) {
          this.unmatchedIngredients.delete(unmatched)
        }
      }
    } else if (selectionKey) {
      this.pendingSelections.delete(selectionKey)
      this.unmatchedIngredients.add(ingredient.name)
    }

    return {
      response: {
        ok: result.ok,
        query: selectedQuery,
        ingredientName: ingredient.name,
        ingredientQuantity: ingredient.quantity,
        ingredientUnit: ingredient.unit,
        selected,
        alternatives,
        confidence,
        products: result.products,
      },
      summary: selected
        ? `Matched ${ingredient.name} to ${selected.description}${this.pendingSelections.get(selectionKey)?.quantity && this.pendingSelections.get(selectionKey)!.quantity > 1 ? ` and estimated ${this.pendingSelections.get(selectionKey)!.quantity} retail units` : ""}.`
        : krogerApiMessage && !result.ok
          ? krogerApiMessage
          : `No Kroger products matched ${ingredient.name}.`,
    }
  }

  private async addKrogerItemsToCart(args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
    if (!this.permissionState.allowCartMutation) {
      return {
        response: {
          ok: false,
          blocked: true,
          message: "Cart mutation requires explicit buy intent in the latest user message.",
        },
        summary: "Cart mutation blocked because the latest user turn did not include explicit buy intent.",
      }
    }

    const rawItems = Array.isArray(args.items) ? args.items : []
    const dish = String(args.dish ?? "Groceries")
    const recipeSource = isRecipeSourceValue(args.recipeSource) ? args.recipeSource : "none"
    const unmatchedFromModel = Array.isArray(args.unmatchedIngredients)
      ? args.unmatchedIngredients.filter((item): item is string => typeof item === "string")
      : []
    const video = isVideoMeta(args.video) ? args.video : undefined

    const remainingIngredients = this.getRemainingIngredientNames()
    if (remainingIngredients.length > 0) {
      return {
        response: {
          ok: false,
          ready: false,
          remainingIngredients,
        },
        summary: `Continue matching ingredients before adding to cart: ${remainingIngredients.slice(0, 6).join(", ")}${remainingIngredients.length > 6 ? ", ..." : ""}.`,
      }
    }

    const requestItems = rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        upc: String(item.upc ?? ""),
        quantity: normalizeCartQuantity(item.quantity),
        modality: item.modality === "DELIVERY" ? "DELIVERY" : "PICKUP",
      }))
      .filter((item) => item.upc)

    const result = await this.mcpClients.callKrogerTool<KrogerCartAddResult>("add_kroger_items_to_cart", {
      session_id: this.sessionId,
      items: requestItems,
    })

    if (!result.data.authenticated) {
      return {
        response: {
          ...result.data,
          authUrl: "/auth/kroger",
        },
        summary: "Kroger auth is required before the cart can be updated.",
        needsAuth: true,
        authUrl: "/auth/kroger",
        authUserMessage: "Sign in with Kroger using the button below, then rerun your cart request.",
      }
    }

    const resultByUpc = new Map(result.data.results.map((entry) => [entry.upc, entry]))
    const requestByUpc = new Map(requestItems.map((item) => [item.upc, item]))
    const addedItems = rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => resultByUpc.get(String(item.upc ?? ""))?.success)
      .map((item) => {
        const quantity = requestByUpc.get(String(item.upc ?? ""))?.quantity ?? normalizeCartQuantity(item.quantity)
        const unitPrice = Number(item.priceValue ?? 0) || 0

        return {
          ingredient: String(item.ingredient ?? item.selectedProduct ?? "ingredient"),
          selectedProduct: String(item.selectedProduct ?? "Kroger item"),
          quantity,
          unit: typeof item.unit === "string" && item.unit.trim() ? item.unit : "unit",
          price: formatUsd(unitPrice * quantity),
          upc: String(item.upc ?? ""),
        }
      })

    const failedIngredients = rawItems
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .filter((item) => !resultByUpc.get(String(item.upc ?? ""))?.success)
      .map((item) => String(item.ingredient ?? item.selectedProduct ?? item.upc ?? "ingredient"))

    const previousCart = this.latestCart?.dish === dish ? this.latestCart : null
    const previousItems = previousCart?.items ?? []
    const previousByUpc = new Map(previousItems.map((item) => [item.upc, item]))
    for (const item of addedItems) {
      previousByUpc.set(item.upc, item)
    }
    const mergedItems = Array.from(previousByUpc.values())

    const estimatedTotalValue = mergedItems.reduce((sum, item) => sum + parsePriceValue(item), 0)

    const unmatchedIngredients = Array.from(
      new Set([...(previousCart?.unmatchedIngredients ?? []), ...unmatchedFromModel, ...failedIngredients]),
    ).filter((ingredient) => !mergedItems.some((item) => normalizeIngredientKey(item.ingredient) === normalizeIngredientKey(ingredient)))
    const status = unmatchedIngredients.length > 0 || addedItems.length < rawItems.length ? "partial_cart_ready" : "cart_ready"
    const artifact: CartArtifact = {
      kind: "cart",
      status,
      dish,
      retailer: "Kroger",
      itemsAdded: mergedItems.length,
      estimatedTotal: formatUsd(estimatedTotalValue),
      items: mergedItems,
      openCartUrl: result.data.openCartUrl,
      unmatchedIngredients,
      recipeSource,
      video,
      message: status === "partial_cart_ready" ? "Some ingredients could not be matched or added." : undefined,
    }

    const priorVideoArtifact = this.latestArtifact?.kind === "video" ? this.latestArtifact : null
    this.latestArtifact = priorVideoArtifact ?? artifact
    this.latestCart = artifact
    this.pendingSelections.clear()

    return {
      response: {
        ...result.data,
        cart: artifact,
      },
      summary:
        status === "partial_cart_ready"
          ? `Added ${addedItems.length} item(s) to the cart, with some misses.`
          : `Added ${addedItems.length} item(s) to the Kroger cart.`,
      artifact,
    }
  }

  private async getKrogerCartSummary(): Promise<ToolExecutionOutcome> {
    const result = await this.mcpClients.callKrogerTool<Record<string, unknown>>("get_kroger_cart_summary", {
      session_id: this.sessionId,
    })

    return {
      response: result.data,
      summary: Array.isArray(result.data.items) && result.data.items.length > 0 ? "Loaded the latest Kroger cart summary." : "No recent cart summary is stored for this session.",
    }
  }

  private findKnownIngredient(ingredientName: string, query: string) {
    const searchKeys = new Set([
      normalizeIngredientKey(ingredientName),
      normalizeIngredientKey(query),
    ])

    return this.latestExtractedRecipe?.ingredients.find((ingredient) => {
      const ingredientKeys = [
        ingredient.name.trim().toLowerCase(),
        ingredient.normalizedName.trim().toLowerCase(),
      ]

      return ingredientKeys.some((key) => searchKeys.has(key))
    }) ?? null
  }

  private getRemainingIngredientNames() {
    if (!this.latestExtractedRecipe) {
      return []
    }

    const handledKeys = new Set<string>([
      ...this.pendingSelections.keys(),
      ...Array.from(this.unmatchedIngredients).map((ingredient) => normalizeIngredientKey(ingredient)),
      ...(this.latestCart?.items ?? []).map((item) => normalizeIngredientKey(item.ingredient)),
    ])

    return this.latestExtractedRecipe.ingredients
      .filter((ingredient) => !ingredient.pantryItem)
      .filter((ingredient) => {
        const keys = [normalizeIngredientKey(ingredient.name), normalizeIngredientKey(ingredient.normalizedName)]
        return !keys.some((key) => handledKeys.has(key))
      })
      .map((ingredient) => ingredient.name)
  }

  private resetShoppingState() {
    this.latestCart = null
    this.pendingSelections.clear()
    this.unmatchedIngredients.clear()
  }
}

function isRecipeSourceValue(value: unknown): value is RecipeSource | "none" {
  return value === "youtube_transcript" || value === "fallback_recipe" || value === "video_metadata" || value === "none"
}

function isVideoMeta(
  value: unknown,
): value is {
  title: string
  url: string
  channel: string
} {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.title === "string" && typeof candidate.url === "string" && typeof candidate.channel === "string"
}

function findCartItem(cart: CartArtifact, pattern: RegExp) {
  return cart.items.find((item) => pattern.test(item.ingredient) || pattern.test(item.selectedProduct))
}

function findCartItems(cart: CartArtifact, pattern: RegExp) {
  return cart.items.filter((item) => pattern.test(item.ingredient) || pattern.test(item.selectedProduct))
}

function formatIngredientList(items: string[]) {
  if (items.length === 0) {
    return ""
  }

  if (items.length === 1) {
    return items[0]
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

function extractBakeTemperature(recipeText: string | null) {
  if (!recipeText) {
    return null
  }

  const match = recipeText.match(/(\d{3})\s*(?:degrees?\s*)?(c|f)\b/i)
  if (!match) {
    return null
  }

  return `${match[1]}°${match[2].toUpperCase()}`
}

function extractBakeDuration(recipeText: string | null) {
  if (!recipeText) {
    return null
  }

  const rangeMatch = recipeText.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*minutes?/i)
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]} minutes`
  }

  const singleMatch = recipeText.match(/(\d{1,2})\s*minutes?/i)
  return singleMatch ? `${singleMatch[1]} minutes` : null
}

function extractRequestedServings(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "user") {
      continue
    }

    const match = message.content.match(/\bfor\s+(\d+)\s+servings?\b/i) ?? message.content.match(/\b(\d+)\s+servings?\b/i)
    if (match) {
      const servings = Number(match[1])
      if (Number.isInteger(servings) && servings > 0) {
        return servings
      }
    }
  }

  return 4
}

function normalizeServingsArg(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null
  }

  return value
}

function normalizeCartQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1
  }

  return Math.max(1, Math.ceil(value))
}

function normalizeIngredientKey(value: string) {
  return value.trim().toLowerCase()
}

function parsePriceValue(item: { price?: string } | Record<string, unknown>) {
  const price = typeof item.price === "string" ? item.price : ""
  const normalized = Number(price.replace(/[^0-9.]+/g, ""))
  return Number.isFinite(normalized) ? normalized : 0
}

function buildVideoRecipeText(
  video: {
    title: string
    url: string
    channel: string
    description?: string
  },
  transcript?: string,
) {
  return [
    `Video title: ${video.title}`,
    video.channel ? `Channel: ${video.channel}` : "",
    video.description?.trim() ? `Video description:\n${video.description.trim()}` : "",
    transcript?.trim() ? `Transcript:\n${transcript.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function buildVideoDescriptionContext(
  video: {
    title: string
    url: string
    channel: string
    description?: string
  },
  transcriptStatus?: "available" | "unavailable" | "blocked" | "error",
  transcriptMessage?: string,
) {
  const transcriptNote =
    transcriptStatus === "blocked"
      ? "Transcript retrieval was temporarily blocked by YouTube from the server side. The video may still have captions on YouTube, so infer the most likely recipe ingredients and instructions from the title and description only."
      : transcriptStatus === "error"
        ? "Transcript retrieval failed for this video right now. Infer the most likely recipe ingredients and instructions from the title and description only."
      : transcriptMessage?.trim()
        ? `${transcriptMessage.trim()} Infer the most likely recipe ingredients and instructions from the title and description only.`
        : "Transcript unavailable. Infer the most likely recipe ingredients and instructions from the title and description only."

  return [
    `Video title: ${video.title}`,
    video.channel ? `Channel: ${video.channel}` : "",
    video.description?.trim() ? `Video description:\n${video.description.trim()}` : "",
    transcriptNote,
  ]
    .filter(Boolean)
    .join("\n\n")
}

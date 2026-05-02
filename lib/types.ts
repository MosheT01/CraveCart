export type IngredientCategory =
  | "meat"
  | "dairy"
  | "produce"
  | "bakery"
  | "pantry"
  | "frozen"
  | "beverage"
  | "other"

export type RecipeSource = "youtube_transcript" | "fallback_recipe" | "video_metadata"

export type ProgressStepId =
  | "finding_recipe"
  | "building_grocery_list"
  | "matching_products"
  | "adding_to_cart"

export interface RunCravePipelineInput {
  craving: string
  servings: number
}

export interface NormalizedCraving {
  raw: string
  cleaned: string
  canonicalDish: string
  searchQuery: string
}

export interface SelectedVideo {
  videoId: string
  title: string
  url: string
  channel: string
  description: string
  duration: string | null
  durationSeconds: number | null
  score: number
}

export interface ExtractedIngredient {
  name: string
  normalizedName: string
  quantity: number | null
  unit: string | null
  category: IngredientCategory
  required: boolean
  pantryItem: boolean
  notes: string | null
}

export interface ExtractedRecipe {
  dish: string
  servings: number
  ingredients: ExtractedIngredient[]
  pantryAssumptions: string[]
  instructionsSummary: string
}

export interface KrogerProduct {
  productId: string
  upc: string
  description: string
  brand: string | null
  size: string | null
  priceValue: number | null
  priceLabel: string | null
  imageUrl: string | null
  modality: "PICKUP" | "DELIVERY" | "SHIP" | "IN_STORE"
  raw?: unknown
}

export interface ProductMatch {
  ingredient: string
  query: string
  selected: KrogerProduct | null
  alternatives: KrogerProduct[]
  confidence: number
  reasoning: string
}

export interface CartItemRequest {
  upc: string
  quantity: number
  modality: "PICKUP" | "DELIVERY"
}

export interface CartAddOutcome {
  upc: string
  quantity: number
  success: boolean
  message?: string
}

export interface CartItemSummary {
  ingredient: string
  selectedProduct: string
  quantity: number
  unit: string
  price: string
  upc: string
}

export interface CartSummary {
  retailer: "Kroger"
  itemsAdded: number
  estimatedTotal: string
  items: CartItemSummary[]
  openCartUrl: string
}

export interface CraveSuccessResponse {
  status: "cart_ready"
  dish: string
  video: {
    title: string
    url: string
    channel: string
  }
  cart: CartSummary
  hiddenDetails: {
    recipeSource: RecipeSource
    unmatchedIngredients: string[]
  }
}

export interface CravePartialResponse {
  status: "partial_cart_ready"
  message: string
  dish: string
  video: {
    title: string
    url: string
    channel: string
  }
  cart: CartSummary
  hiddenDetails: {
    recipeSource: RecipeSource
    unmatchedIngredients: string[]
  }
}

export interface CraveNeedsAuthResponse {
  status: "needs_kroger_auth"
  authUrl: "/auth/kroger"
}

export interface CraveErrorResponse {
  status: "error"
  message: string
}

export type CraveResponse =
  | CraveSuccessResponse
  | CravePartialResponse
  | CraveNeedsAuthResponse
  | CraveErrorResponse

export interface KrogerHealthResponse {
  ok: boolean
  configured: boolean
  authenticated?: boolean
}

/** Per-browser-session OAuth state from kroger-mcp ``GET /session/status``. */
export interface KrogerSessionOAuthStatus {
  ok: boolean
  configured: boolean
  authenticated: boolean
}

export interface KrogerAuthStartResponse {
  authUrl: string
}

export interface KrogerAuthCallbackResponse {
  ok: boolean
  connected: boolean
  profileId?: string | null
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface MutationPermissionState {
  allowCartMutation: boolean
  latestUserMessage: string
}

export interface VideoArtifact {
  kind: "video"
  video: {
    title: string
    url: string
    channel: string
  }
  transcriptAvailable: boolean
  transcriptStatus?: "available" | "unavailable" | "blocked" | "error"
  transcriptMessage?: string
  recipeSource: RecipeSource | "none"
  summary: string
}

export interface CartArtifact {
  kind: "cart"
  status: "cart_ready" | "partial_cart_ready"
  dish: string
  retailer: "Kroger"
  itemsAdded: number
  estimatedTotal: string
  items: CartItemSummary[]
  openCartUrl: string
  unmatchedIngredients: string[]
  recipeSource: RecipeSource | "none"
  video?: {
    title: string
    url: string
    channel: string
  }
  message?: string
}

export type AgentArtifact = CartArtifact | VideoArtifact

export interface ToolTraceEntry {
  id: string
  name: string
  status: "started" | "finished"
  summary: string
  arguments: Record<string, unknown>
  output?: unknown
}

export type AgentStreamEvent =
  | {
      type: "assistant_text_delta"
      delta: string
    }
  | {
      type: "tool_call_started"
      trace: ToolTraceEntry
    }
  | {
      type: "tool_call_finished"
      trace: ToolTraceEntry
    }
  | {
      type: "needs_kroger_auth"
      message: string
      authUrl: "/auth/kroger"
      artifact?: VideoArtifact | null
      activity: ToolTraceEntry[]
    }
  | {
      type: "cart_ready"
      message: string
      cart: CartArtifact
      activity: ToolTraceEntry[]
    }
  | {
      type: "error"
      message: string
    }

export interface AgentTurnResult {
  assistantMessage: string
  activity: ToolTraceEntry[]
  artifact: AgentArtifact | null
  cart: CartArtifact | null
  needsAuth: boolean
  authUrl: "/auth/kroger" | null
}

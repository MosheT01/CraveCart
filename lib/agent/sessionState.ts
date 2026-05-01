import type { AgentArtifact, CartArtifact, ExtractedRecipe, RecipeSource } from "@/lib/types"

export interface StoredPendingSelection {
  ingredient: string
  upc: string
  selectedProduct: string
  quantity: number
  unit: string
  price: string
  priceValue: number
  modality: "PICKUP" | "DELIVERY"
}

export interface AgentSessionState {
  latestArtifact: AgentArtifact | null
  latestCart: CartArtifact | null
  latestDish: string
  latestRecipeSource: RecipeSource | "none"
  latestRecipeText: string | null
  latestFallbackStructuredRecipe: ExtractedRecipe | null
  latestExtractedRecipe: ExtractedRecipe | null
  pendingSelections: StoredPendingSelection[]
  unmatchedIngredients: string[]
  updatedAt: number
}

type SessionStore = Map<string, AgentSessionState>

const SESSION_TTL_MS = 1000 * 60 * 60 * 6

declare global {
  var __cravecartAgentSessions: SessionStore | undefined
}

function getStore(): SessionStore {
  if (!globalThis.__cravecartAgentSessions) {
    globalThis.__cravecartAgentSessions = new Map()
  }

  cleanupExpired(globalThis.__cravecartAgentSessions)
  return globalThis.__cravecartAgentSessions
}

function cleanupExpired(store: SessionStore) {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [sessionId, state] of store.entries()) {
    if ((state.updatedAt ?? 0) < cutoff) {
      store.delete(sessionId)
    }
  }
}

export function getAgentSessionState(sessionId: string): AgentSessionState | null {
  const state = getStore().get(sessionId)
  if (!state) {
    return null
  }

  return {
    ...state,
    pendingSelections: [...state.pendingSelections],
    unmatchedIngredients: [...state.unmatchedIngredients],
  }
}

export function setAgentSessionState(sessionId: string, state: Omit<AgentSessionState, "updatedAt">) {
  getStore().set(sessionId, {
    ...state,
    pendingSelections: [...state.pendingSelections],
    unmatchedIngredients: [...state.unmatchedIngredients],
    updatedAt: Date.now(),
  })
}

export function clearAgentSessionState(sessionId: string) {
  getStore().delete(sessionId)
}

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

export interface UserPreferences {
  allergies: string[]
  dietary: string[]
  avoidedIngredients: string[]
  other: string[]
  collectedAt?: number
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
  userPreferences: UserPreferences | null
  preferencesConfirmed: boolean
  updatedAt: number
}

/** Fresh session shape for `setAgentSessionState` before any recipe/cart work. */
export function createEmptyAgentSessionBase(): Omit<AgentSessionState, "updatedAt"> {
  return {
    latestArtifact: null,
    latestCart: null,
    latestDish: "",
    latestRecipeSource: "none",
    latestRecipeText: null,
    latestFallbackStructuredRecipe: null,
    latestExtractedRecipe: null,
    pendingSelections: [],
    unmatchedIngredients: [],
    userPreferences: null,
    preferencesConfirmed: false,
  }
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

const DIETARY_KEYWORDS = [
  "vegan", "vegetarian", "halal", "kosher", "organic", "low-carb", "keto", "paleo", "gluten-free", "gf",
  "dairy-free", "nut-free", "egg-free", "sugar-free", "whole30", " Atkins ", "Weight Watchers"
]

const ALLERGY_KEYWORDS = [
  "nuts", "peanuts", "almonds", "walnuts", "cashews", "pecans",
  "gluten", "wheat", "barley", "rye",
  "dairy", "milk", "lactose", "cheese", "butter", "cream",
  "shellfish", "shrimp", "crab", "lobster",
  "eggs", "soy", "sesame", "fish", "corn", "pork"
]

export function parseUserPreferences(message: string): UserPreferences | null {
  const lower = message.toLowerCase().trim()

  const emptyPrefs = (): UserPreferences => ({
    allergies: [],
    dietary: [],
    avoidedIngredients: [],
    other: [],
    collectedAt: Date.now(),
  })

  if (
    /\bno restrictions?\b/i.test(lower) ||
    /\bwithout restrictions?\b/i.test(lower) ||
    /\bno dietary restrictions?\b/i.test(lower) ||
    /\beat anything\b/i.test(lower) ||
    /\bi\s+have\s+no\s+(restrictions?|allergies)\b/i.test(lower) ||
    /\bi\s+don'?t\s+have\s+any\s+(restrictions?|allergies|dietary)\b/i.test(lower) ||
    /\bdon'?t\s+have\s+any\s+(restrictions?|allergies)\b/i.test(lower) ||
    /^\s*(no\s+restrictions?|none|n\/?a)\s*[!.]?\s*$/i.test(lower)
  ) {
    return emptyPrefs()
  }

  const allergies: string[] = []
  const dietary: string[] = []
  const avoidedIngredients: string[] = []
  const other: string[] = []

  for (const a of ALLERGY_KEYWORDS) {
    if (lower.includes(a)) {
      allergies.push(a.replace(/[^a-z]/g, ""))
    }
  }

  for (const d of DIETARY_KEYWORDS) {
    if (lower.includes(d.toLowerCase())) {
      dietary.push(d.toLowerCase().replace(/[^a-z]/g, ""))
    }
  }

  if (allergies.length === 0 && dietary.length === 0 && avoidedIngredients.length === 0 && other.length === 0) {
    return null
  }

  return {
    allergies: [...new Set(allergies)],
    dietary: [...new Set(dietary)],
    avoidedIngredients: [...new Set(avoidedIngredients)],
    other: [...new Set(other)],
    collectedAt: Date.now(),
  }
}

const CONFIRMATION_PATTERNS = [
  /\byes\b/i, /\byeah\b/i, /\bcorrect\b/i, /\bconfirm\b/i, /\bthat'?s right\b/i, /\byep\b/i,
  /\bagree\b/i, /\bsure\b/i, /\bokay\b/i, /\bok\b/i, /\byes,? (that'?s )?(correct|right|exact)\b/i,
  /\bno(,? that'?s wrong)?\b/i, /\bchange\b/i, /\bnot quite\b/i, /\bactually\b/i,
]

export function isPreferencesConfirmation(message: string, hasPreferences: boolean): boolean {
  if (!hasPreferences) return false
  const lower = message.toLowerCase()

  for (const pattern of CONFIRMATION_PATTERNS) {
    if (pattern.test(lower)) {
      return true
    }
  }

  const negativePatterns = [/\bno\b/i, /\bwrong\b/i, /\bchange\b/i, /\bupdate\b/i, /\bfix\b/i]
  for (const pattern of negativePatterns) {
    if (pattern.test(lower)) {
      return false
    }
  }

  return false
}

/** True when stored prefs include real safety constraints worth one confirmation step. */
export function preferencesRequireSafetyConfirmation(p: UserPreferences): boolean {
  if (p.allergies.length > 0 || p.avoidedIngredients.length > 0) return true
  if (p.dietary.length > 0) return true
  if (p.other.some((entry) => /\b(allerg|avoid|restriction|medical)\b/i.test(entry))) return true
  return false
}

export function getUpdatedPreferencesFromResponse(message: string, currentPrefs: UserPreferences): UserPreferences | null {
  const parsed = parseUserPreferences(message)
  if (!parsed) return null

  return {
    allergies: parsed.allergies.length > 0 ? parsed.allergies : currentPrefs.allergies,
    dietary: parsed.dietary.length > 0 ? parsed.dietary : currentPrefs.dietary,
    avoidedIngredients: parsed.avoidedIngredients.length > 0 ? parsed.avoidedIngredients : currentPrefs.avoidedIngredients,
    other: parsed.other.length > 0 ? parsed.other : currentPrefs.other,
    collectedAt: Date.now(),
  }
}

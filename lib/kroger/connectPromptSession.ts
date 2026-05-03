/**
 * Frontend-only stub for Kroger connect prompt session state.
 * Manages whether the user has dismissed the Kroger connect prompt.
 */

const KROGER_PROMPT_DISMISSED_KEY = "cravecart_kroger_prompt_dismissed"

/**
 * Check if the Kroger connect prompt has been dismissed this session.
 */
export function isKrogerConnectPromptDismissed(storage: Storage): boolean {
  return storage.getItem(KROGER_PROMPT_DISMISSED_KEY) === "1"
}

/**
 * Mark the Kroger connect prompt as dismissed for this session.
 */
export function setKrogerConnectPromptDismissed(storage: Storage): void {
  storage.setItem(KROGER_PROMPT_DISMISSED_KEY, "1")
}

/**
 * Clear the Kroger connect prompt dismissed state.
 */
export function clearKrogerConnectPromptDismissed(storage: Storage): void {
  storage.removeItem(KROGER_PROMPT_DISMISSED_KEY)
}

/** Session-only: user tapped "Not now" on the Kroger connect prompt; cleared when agent needs Kroger auth or manual disconnect reconnect flow. */
export const KROGER_CONNECT_PROMPT_DISMISSED_KEY = "cravecart_kroger_connect_prompt_dismissed"

export function isKrogerConnectPromptDismissed(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(KROGER_CONNECT_PROMPT_DISMISSED_KEY) === "1"
}

export function setKrogerConnectPromptDismissed(storage: Pick<Storage, "setItem">): void {
  storage.setItem(KROGER_CONNECT_PROMPT_DISMISSED_KEY, "1")
}

export function clearKrogerConnectPromptDismissed(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(KROGER_CONNECT_PROMPT_DISMISSED_KEY)
}

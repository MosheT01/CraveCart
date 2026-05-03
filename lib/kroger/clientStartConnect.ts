/**
 * Frontend-only stub for Kroger connect flow.
 * Backend will handle OAuth initiation via API.
 */

const KROGER_REDIRECT_PENDING_KEY = "cravecart_kroger_redirect_pending"

/**
 * Storage key for tracking pending Kroger connect handoff.
 */
export const KROGER_CONNECT_PENDING_STORAGE_KEY = "cravecart_kroger_connect_pending"

/**
 * Custom event name for Kroger pending handoff state changes.
 */
export const KROGER_PENDING_HANDOFF_EVENT = "cravecart:kroger-pending-handoff"

export type KrogerConnectResult =
  | { kind: "redirect" }
  | { kind: "unauthorized"; message?: string }
  | { kind: "error"; message?: string }

/**
 * Start the Kroger OAuth connect flow.
 * Calls the backend API to get the auth URL, then redirects.
 */
export async function startKrogerConnect(): Promise<KrogerConnectResult> {
  try {
    const response = await fetch("/api/kroger/auth/start", {
      method: "POST",
      credentials: "same-origin",
    })

    if (response.status === 401) {
      return { kind: "unauthorized", message: "Sign in to connect your Kroger account." }
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string }
      return { kind: "error", message: data.message ?? "Could not start Kroger connection." }
    }

    const data = (await response.json()) as { authUrl?: string }
    
    if (data.authUrl) {
      setKrogerConnectRedirectPending()
      window.location.assign(data.authUrl)
      return { kind: "redirect" }
    }

    return { kind: "error", message: "No authorization URL returned." }
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Network error connecting to Kroger.",
    }
  }
}

/**
 * Mark that a Kroger connect redirect is pending.
 */
export function setKrogerConnectRedirectPending(): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(KROGER_REDIRECT_PENDING_KEY, "1")
  }
}

/**
 * Clear the Kroger connect redirect pending flag.
 */
export function clearKrogerConnectRedirectPending(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(KROGER_REDIRECT_PENDING_KEY)
  }
}

/**
 * Check if a Kroger connect redirect is pending.
 */
export function isKrogerConnectRedirectPending(): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(KROGER_REDIRECT_PENDING_KEY) === "1"
}

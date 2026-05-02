/** Set when navigating away to Kroger OAuth; cleared when connection is verified. */
export const KROGER_CONNECT_PENDING_STORAGE_KEY = "cravecart_kroger_pending" as const

/** DOM event so UI can re-read localStorage (same-tab clears do not emit `storage`). */
export const KROGER_PENDING_HANDOFF_EVENT = "cravecart:kroger-pending-handoff"

function notifyKrogerPendingHandoffListeners() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(KROGER_PENDING_HANDOFF_EVENT))
}

export function markKrogerConnectRedirectPending() {
  if (typeof window === "undefined") return
  localStorage.setItem(KROGER_CONNECT_PENDING_STORAGE_KEY, "1")
  notifyKrogerPendingHandoffListeners()
}

export function clearKrogerConnectRedirectPending() {
  if (typeof window === "undefined") return
  if (!localStorage.getItem(KROGER_CONNECT_PENDING_STORAGE_KEY)) return
  localStorage.removeItem(KROGER_CONNECT_PENDING_STORAGE_KEY)
  notifyKrogerPendingHandoffListeners()
}

export type KrogerStartConnectResult =
  | { kind: "redirect" }
  | { kind: "unauthorized" }
  | { kind: "error"; message?: string }

/**
 * Starts Kroger OAuth. On success, redirects the browser and does not return.
 */
export async function startKrogerConnect(): Promise<KrogerStartConnectResult> {
  try {
    const res = await fetch("/api/kroger/auth/start", {
      method: "POST",
      credentials: "same-origin",
    })
    const data = (await res.json()) as { authUrl?: string; message?: string; error?: string }

    if (res.status === 401) {
      return { kind: "unauthorized" }
    }

    if (data.authUrl) {
      markKrogerConnectRedirectPending()
      window.location.assign(data.authUrl)
      return { kind: "redirect" }
    }

    return {
      kind: "error",
      message: data.message ?? data.error ?? "Could not start Kroger connection.",
    }
  } catch (e) {
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "Network error.",
    }
  }
}

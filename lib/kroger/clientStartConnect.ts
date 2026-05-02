/** Set when navigating away to Kroger OAuth; cleared when connection is verified or mocked. */
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
  | { kind: "mock" }
  | { kind: "redirect" }
  | { kind: "unauthorized" }
  | { kind: "error"; message?: string }

/**
 * Starts Kroger OAuth (or mock mode). On real OAuth, redirects the browser and does not return.
 */
export async function startKrogerConnect(): Promise<KrogerStartConnectResult> {
  try {
    const res = await fetch("/api/kroger/auth/start", {
      method: "POST",
      credentials: "same-origin",
    })
    const data = (await res.json()) as { mockMode?: boolean; authUrl?: string; message?: string; error?: string }

    if (res.status === 401) {
      return { kind: "unauthorized" }
    }

    if (data.mockMode) {
      clearKrogerConnectRedirectPending()
      localStorage.setItem("cravecart_kroger_connected", "1")
      localStorage.setItem("cravecart_kroger_mock", "1")
      return { kind: "mock" }
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

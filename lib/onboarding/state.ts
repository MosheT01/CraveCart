/** Persists after user completes/skips the product tour (and mirrored in a first-party cookie). */
export const STORAGE_ONBOARDING_V1 = "cravecart_onboarding_v1"

/** HTTP cookie name: first visit tour finished (works when only cookies are available). */
export const COOKIE_FIRST_TOUR_DONE_V1 = "cravecart_first_tour_done_v1"

/** Set after first visit to the login screen so copy can switch to “Welcome back”. */
export const STORAGE_VISITED_V1 = "cravecart_visited_v1"

const DONE = "1"
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400 // ~400 days

function readCookieValue(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";")
  for (const part of parts) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (k !== name) continue
    return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

export function hasCompletedOnboarding(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(STORAGE_ONBOARDING_V1) === DONE
}

/** True if this browser has finished the first-visit tour (localStorage and/or cookie). */
export function hasSeenFirstVisitTour(
  storage: Pick<Storage, "getItem">,
  cookieDocumentOrHeader: string | null | undefined,
): boolean {
  if (hasCompletedOnboarding(storage)) return true
  if (cookieDocumentOrHeader && readCookieValue(cookieDocumentOrHeader, COOKIE_FIRST_TOUR_DONE_V1) === DONE) {
    return true
  }
  return false
}

function writeFirstVisitTourCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = [
    `${encodeURIComponent(COOKIE_FIRST_TOUR_DONE_V1)}=${encodeURIComponent(DONE)}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
    "SameSite=Lax",
  ].join("; ")
}

/** Call when user finishes the tour, skips it, or OAuth redirect is about to leave the app. */
export function markFirstVisitTourSeen(storage: Pick<Storage, "setItem">): void {
  storage.setItem(STORAGE_ONBOARDING_V1, DONE)
  writeFirstVisitTourCookie()
}

/** @deprecated Prefer markFirstVisitTourSeen — same localStorage write without cookie. */
export function markOnboardingComplete(storage: Pick<Storage, "setItem">): void {
  storage.setItem(STORAGE_ONBOARDING_V1, DONE)
}

/** Auto-show the cinematic overlay on first-ever visit (signed in or not, Kroger linked or not). */
export function shouldShowOnboardingAuto(args: {
  storage: Pick<Storage, "getItem">
  /** Use `document.cookie` in the browser; optional in tests */
  cookie?: string | null
}): boolean {
  return !hasSeenFirstVisitTour(args.storage, args.cookie ?? null)
}

export function isReturningVisitor(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(STORAGE_VISITED_V1) === DONE
}

/** Idempotent: sets visited flag the first time so the next login screen visit gets “Welcome back”. */
export function markVisited(storage: Pick<Storage, "getItem" | "setItem">): void {
  if (storage.getItem(STORAGE_VISITED_V1) !== DONE) {
    storage.setItem(STORAGE_VISITED_V1, DONE)
  }
}

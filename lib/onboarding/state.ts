/**
 * Frontend-only stub for onboarding state management.
 * Tracks first-visit tour and returning visitor status.
 */

const FIRST_VISIT_TOUR_SEEN_KEY = "cravecart_tour_seen"
const VISITED_KEY = "cravecart_visited"

interface OnboardingCheckParams {
  storage: Storage
  cookie?: string
}

/**
 * Check if onboarding should auto-show for this user.
 * Shows if the user hasn't seen the tour yet.
 */
export function shouldShowOnboardingAuto({ storage }: OnboardingCheckParams): boolean {
  return storage.getItem(FIRST_VISIT_TOUR_SEEN_KEY) !== "1"
}

/**
 * Mark that the user has seen the first-visit tour.
 */
export function markFirstVisitTourSeen(storage: Storage): void {
  storage.setItem(FIRST_VISIT_TOUR_SEEN_KEY, "1")
}

/**
 * Check if this is a returning visitor.
 */
export function isReturningVisitor(storage: Storage): boolean {
  return storage.getItem(VISITED_KEY) === "1"
}

/**
 * Mark the user as having visited before.
 */
export function markVisited(storage: Storage): void {
  storage.setItem(VISITED_KEY, "1")
}

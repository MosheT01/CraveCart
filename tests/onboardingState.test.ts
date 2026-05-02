import { describe, expect, it } from "vitest"
import {
  COOKIE_FIRST_TOUR_DONE_V1,
  STORAGE_ONBOARDING_V1,
  STORAGE_VISITED_V1,
  hasCompletedOnboarding,
  hasSeenFirstVisitTour,
  isReturningVisitor,
  markFirstVisitTourSeen,
  markOnboardingComplete,
  markVisited,
  shouldShowOnboardingAuto,
} from "@/lib/onboarding/state"

function mockStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    _map: map,
  }
}

describe("shouldShowOnboardingAuto / hasSeenFirstVisitTour", () => {
  it("is true on first visit (no storage, no cookie)", () => {
    const s = mockStorage()
    expect(shouldShowOnboardingAuto({ storage: s, cookie: "" })).toBe(true)
    expect(hasSeenFirstVisitTour(s, "")).toBe(false)
  })

  it("is false when localStorage marks tour done", () => {
    const s = mockStorage({ [STORAGE_ONBOARDING_V1]: "1" })
    expect(shouldShowOnboardingAuto({ storage: s, cookie: "" })).toBe(false)
    expect(hasSeenFirstVisitTour(s, "")).toBe(true)
  })

  it("is false when first-visit cookie is set (survives LS clear)", () => {
    const s = mockStorage()
    const cookie = `${COOKIE_FIRST_TOUR_DONE_V1}=1`
    expect(shouldShowOnboardingAuto({ storage: s, cookie })).toBe(false)
    expect(hasSeenFirstVisitTour(s, cookie)).toBe(true)
  })

  it("ignores Kroger / auth — linked vs not does not change truth", () => {
    const s = mockStorage()
    expect(shouldShowOnboardingAuto({ storage: s, cookie: null })).toBe(true)
    expect(shouldShowOnboardingAuto({ storage: s, cookie: "" })).toBe(true)
  })
})

describe("markOnboardingComplete", () => {
  it("persists completion flag", () => {
    const s = mockStorage()
    markOnboardingComplete(s)
    expect(s._map.get(STORAGE_ONBOARDING_V1)).toBe("1")
    expect(hasCompletedOnboarding(s)).toBe(true)
  })
})

describe("markFirstVisitTourSeen", () => {
  it("persists localStorage and sets cookie in browser", () => {
    const s = mockStorage()
    markFirstVisitTourSeen(s)
    expect(s._map.get(STORAGE_ONBOARDING_V1)).toBe("1")
    if (typeof document !== "undefined") {
      expect(document.cookie).toContain(COOKIE_FIRST_TOUR_DONE_V1)
    }
  })
})

describe("markVisited / isReturningVisitor", () => {
  it("first visit is not returning", () => {
    const s = mockStorage()
    expect(isReturningVisitor(s)).toBe(false)
    markVisited(s)
    expect(isReturningVisitor(s)).toBe(true)
  })

  it("markVisited is idempotent", () => {
    const s = mockStorage()
    markVisited(s)
    markVisited(s)
    expect(s._map.get(STORAGE_VISITED_V1)).toBe("1")
  })
})

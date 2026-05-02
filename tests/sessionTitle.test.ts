import { describe, expect, it } from "vitest"
import {
  PLACEHOLDER_CHAT_TITLE,
  fallbackChatTitleFromFirstMessage,
  isLikelyPoorChatTitle,
  needsAiChatTitle,
  normalizeGeminiChatTitle,
  pickBestGeminiTitleLine,
  pickFirstUserMessageForSessionTitle,
  resolvePersistedChatTitle,
} from "@/lib/chat/sessionTitle"

describe("resolvePersistedChatTitle", () => {
  const sid = "session-1"

  it("uses resolved ref over sidebar when both exist", () => {
    expect(
      resolvePersistedChatTitle({
        sessionId: sid,
        resolvedTitles: new Map([[sid, "From Gemini"]]),
        sessions: [{ id: sid, title: "Sidebar old" }],
        isFirstUserTurn: false,
        currentPrompt: "Second message text",
      }),
    ).toBe("From Gemini")
  })

  it("ignores placeholder sidebar title so a later prompt can rename the thread", () => {
    expect(
      resolvePersistedChatTitle({
        sessionId: sid,
        resolvedTitles: new Map(),
        sessions: [{ id: sid, title: PLACEHOLDER_CHAT_TITLE }],
        isFirstUserTurn: false,
        currentPrompt: "Buy oat milk please",
      }),
    ).toBe("Buy oat milk please")
  })

  it("truncates a long prompt on non-first turns when no settled title exists", () => {
    const long = "x".repeat(60)
    expect(
      resolvePersistedChatTitle({
        sessionId: sid,
        resolvedTitles: new Map(),
        sessions: [{ id: sid, title: PLACEHOLDER_CHAT_TITLE }],
        isFirstUserTurn: false,
        currentPrompt: long,
      }),
    ).toBe(`${"x".repeat(45)}…`)
  })

  it("returns placeholder on first turn with no sidebar yet", () => {
    expect(
      resolvePersistedChatTitle({
        sessionId: sid,
        resolvedTitles: new Map(),
        sessions: [],
        isFirstUserTurn: true,
        currentPrompt: "Craving tacos tonight",
      }),
    ).toBe(PLACEHOLDER_CHAT_TITLE)
  })

  it("treats resolved placeholder title as unset", () => {
    expect(
      resolvePersistedChatTitle({
        sessionId: sid,
        resolvedTitles: new Map([[sid, PLACEHOLDER_CHAT_TITLE]]),
        sessions: [],
        isFirstUserTurn: false,
        currentPrompt: "Follow up msg",
      }),
    ).toBe("Follow up msg")
  })
})

describe("needsAiChatTitle", () => {
  const sid = "s"

  it("needs a title while only placeholder exists in sidebar", () => {
    expect(
      needsAiChatTitle({
        sessionId: sid,
        aiTitleRequested: new Set(),
        resolvedTitles: new Map(),
        sessions: [{ id: sid, title: PLACEHOLDER_CHAT_TITLE }],
      }),
    ).toBe(true)
  })

  it("does not spam while a request is pending", () => {
    expect(
      needsAiChatTitle({
        sessionId: sid,
        aiTitleRequested: new Set([sid]),
        resolvedTitles: new Map(),
        sessions: [{ id: sid, title: PLACEHOLDER_CHAT_TITLE }],
      }),
    ).toBe(false)
  })

  it("does not need when a real sidebar title exists", () => {
    expect(
      needsAiChatTitle({
        sessionId: sid,
        aiTitleRequested: new Set(),
        resolvedTitles: new Map(),
        sessions: [{ id: sid, title: "Chicken ramen run" }],
      }),
    ).toBe(false)
  })

  it("does not need when resolved map has a settled title", () => {
    expect(
      needsAiChatTitle({
        sessionId: sid,
        aiTitleRequested: new Set(),
        resolvedTitles: new Map([[sid, "From ref"]]),
        sessions: [{ id: sid, title: PLACEHOLDER_CHAT_TITLE }],
      }),
    ).toBe(false)
  })
})

describe("pickFirstUserMessageForSessionTitle", () => {
  it("uses the compose prompt on opening turn", () => {
    expect(
      pickFirstUserMessageForSessionTitle({
        isFirstUserTurn: true,
        currentPrompt: "Make lasagna ingredients",
        priorMessages: [],
      }),
    ).toBe("Make lasagna ingredients")
  })

  it("uses the first user bubble on retries instead of latest prompt", () => {
    expect(
      pickFirstUserMessageForSessionTitle({
        isFirstUserTurn: false,
        currentPrompt: "Also add parmesan",
        priorMessages: [
          { role: "user", content: "Chicken alfredo for four" },
          { role: "assistant", content: "ok" },
        ],
      }),
    ).toBe("Chicken alfredo for four")
  })
})

describe("fallbackChatTitleFromFirstMessage", () => {
  it("ellipsis long lines", () => {
    expect(fallbackChatTitleFromFirstMessage("a".repeat(60))).toBe(`${"a".repeat(45)}…`)
  })

  it("collapse whitespace", () => {
    expect(fallbackChatTitleFromFirstMessage(" hello   world ")).toBe("hello world")
  })
})

describe("normalizeGeminiChatTitle", () => {
  it("falls back when model returned empty-ish text", () => {
    expect(normalizeGeminiChatTitle(undefined, "eggs bacon")).toBe("eggs bacon")
    expect(normalizeGeminiChatTitle("   ", "eggs bacon")).toBe("eggs bacon")
  })

  it("strips leading quotes", () => {
    expect(normalizeGeminiChatTitle(`"Breakfast burrito groceries"`, "x")).toBe("Breakfast burrito groceries")
  })

  it("truncates long model output", () => {
    const long = "w".repeat(80)
    expect(normalizeGeminiChatTitle(long, "x")).toBe(`${"w".repeat(53)}…`)
  })

  it("rejects ultra-short model junk in favor of user fallback", () => {
    expect(normalizeGeminiChatTitle("C", "i like wheels")).toBe("i like wheels")
    expect(normalizeGeminiChatTitle("Let", "wheels of cheese please")).toBe("wheels of cheese please")
    expect(normalizeGeminiChatTitle("Wheel-", "i like wheels")).toBe("i like wheels")
  })

  it("prefers a substantive line when the model echoes markdown or headers", () => {
    const messy = "Here is a title:\nChicken Alfredo ingredients list"
    expect(pickBestGeminiTitleLine(messy).toLowerCase()).toContain("alfredo")
  })
})

describe("isLikelyPoorChatTitle", () => {
  it("flags obvious garbage but allows short food words", () => {
    expect(isLikelyPoorChatTitle("C")).toBe(true)
    expect(isLikelyPoorChatTitle("Tacos")).toBe(false)
    expect(isLikelyPoorChatTitle("מטבח")).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  EMPTY_ASSISTANT_REPLAY_FALLBACK,
  buildChatMessagesForAgent,
  coerceReplayMessageContent,
} from "@/lib/chat/chatHistoryPayload"

describe("buildChatMessagesForAgent", () => {
  it("passes through non-empty messages", () => {
    expect(buildChatMessagesForAgent([{ role: "user", content: " hello " }])).toEqual([
      { role: "user", content: "hello" },
    ])
  })

  it("fills assistant content from error when text is empty", () => {
    expect(
      buildChatMessagesForAgent([
        { role: "user", content: "hi" },
        { role: "assistant", content: "", error: '{"type":"error"}' },
      ]),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: '{"type":"error"}' },
    ])
  })

  it("uses sentinel when assistant has no text and no error", () => {
    expect(
      buildChatMessagesForAgent([
        { role: "user", content: "a" },
        { role: "assistant", content: "   " },
      ]),
    ).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: EMPTY_ASSISTANT_REPLAY_FALLBACK },
    ])
  })
})

describe("coerceReplayMessageContent", () => {
  it("trims non-empty content", () => {
    expect(coerceReplayMessageContent("user", "  ok  ")).toBe("ok")
  })

  it("coerces empty assistant bubbles for storage/replay", () => {
    expect(coerceReplayMessageContent("assistant", "")).toBe(EMPTY_ASSISTANT_REPLAY_FALLBACK)
  })
})

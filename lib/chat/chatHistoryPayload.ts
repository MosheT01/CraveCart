import type { ChatMessage } from "@/lib/types"

/** Shown to the agent when persisted history lacks assistant text so Zod/API never rejects. */
export const EMPTY_ASSISTANT_REPLAY_FALLBACK =
  "(Previous assistant reply missing in saved history—you can continue this thread normally.)"

type ChatLike = {
  role: ChatMessage["role"]
  content: string
  error?: string | null
}

/** Ensures `/api/chat` receives `content` strings that pass `.trim().min(1)`. */
export function buildChatMessagesForAgent(msgs: ReadonlyArray<ChatLike>): ChatMessage[] {
  return msgs.map((m) => {
    const trimmed = typeof m.content === "string" ? m.content.replace(/\s+/g, " ").trim() : ""
    if (trimmed.length > 0) return { role: m.role, content: trimmed }
    if (m.role === "assistant") {
      const err = typeof m.error === "string" ? m.error.replace(/\s+/g, " ").trim() : ""
      return { role: "assistant", content: err.slice(0, 8000) || EMPTY_ASSISTANT_REPLAY_FALLBACK }
    }
    return { role: "user", content: "…" }
  })
}

/** When loading Firestore/local history, coerce empty bubbles so persisted rounds stay valid clientside. */
export function coerceReplayMessageContent(role: "user" | "assistant", raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim()
  if (t.length > 0) return t
  return role === "assistant" ? EMPTY_ASSISTANT_REPLAY_FALLBACK : "…"
}

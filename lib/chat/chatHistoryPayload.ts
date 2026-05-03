/**
 * Frontend-only stub for chat history payload utilities.
 * Backend implementation will be connected via API calls.
 */

import type { ChatMessage } from "@/lib/types"

interface UiMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Build chat messages for the agent API call.
 * In frontend-only mode, this converts UI messages to the API format.
 */
export function buildChatMessagesForAgent(messages: UiMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

/**
 * Coerce replay message content for display.
 * Ensures content is always a string.
 */
export function coerceReplayMessageContent(
  _role: "user" | "assistant",
  content: unknown
): string {
  if (typeof content === "string") return content
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "")
  }
  return ""
}

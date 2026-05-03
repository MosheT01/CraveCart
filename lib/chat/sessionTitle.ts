/**
 * Frontend-only stub for session title utilities.
 * Backend will handle AI-generated titles via API.
 */

import type { ChatSession } from "@/components/Sidebar"

interface UiMessage {
  role: "user" | "assistant"
  content: string
}

interface ResolvePersistedChatTitleParams {
  sessionId: string
  resolvedTitles: Map<string, string>
  sessions: ChatSession[]
  isFirstUserTurn: boolean
  currentPrompt: string
}

/**
 * Resolve a title for persisting to storage.
 * Falls back to truncated first user message if no resolved title exists.
 */
export function resolvePersistedChatTitle({
  sessionId,
  resolvedTitles,
  sessions,
  isFirstUserTurn,
  currentPrompt,
}: ResolvePersistedChatTitleParams): string {
  const resolved = resolvedTitles.get(sessionId)
  if (resolved) return resolved

  const existing = sessions.find((s) => s.id === sessionId)
  if (existing?.title) return existing.title

  if (isFirstUserTurn && currentPrompt) {
    return currentPrompt.slice(0, 50) + (currentPrompt.length > 50 ? "…" : "")
  }

  return "New chat"
}

interface NeedsAiChatTitleParams {
  sessionId: string
  aiTitleRequested: Set<string>
  resolvedTitles: Map<string, string>
  sessions: ChatSession[]
}

/**
 * Check if we should request an AI-generated title for this session.
 */
export function needsAiChatTitle({
  sessionId,
  aiTitleRequested,
  resolvedTitles,
  sessions,
}: NeedsAiChatTitleParams): boolean {
  if (aiTitleRequested.has(sessionId)) return false
  if (resolvedTitles.has(sessionId)) return false
  const existing = sessions.find((s) => s.id === sessionId)
  if (existing?.title) return false
  return true
}

interface PickFirstUserMessageParams {
  isFirstUserTurn: boolean
  currentPrompt: string
  priorMessages: UiMessage[]
}

/**
 * Pick the first user message for generating a session title.
 */
export function pickFirstUserMessageForSessionTitle({
  isFirstUserTurn,
  currentPrompt,
  priorMessages,
}: PickFirstUserMessageParams): string {
  if (isFirstUserTurn) return currentPrompt
  const firstUser = priorMessages.find((m) => m.role === "user")
  return firstUser?.content ?? currentPrompt
}

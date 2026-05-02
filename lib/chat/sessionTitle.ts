/**
 * Chat thread titles: client persist rules + server-side normalization for `/api/chat/session-title`.
 */

/** Placeholder until Gemini (or fallback) supplies a real title. */
export const PLACEHOLDER_CHAT_TITLE = "New chat"

/** First user turn uses the current compose box; retries use the original opening message. */
export function pickFirstUserMessageForSessionTitle(args: {
  isFirstUserTurn: boolean
  currentPrompt: string
  priorMessages: ReadonlyArray<{ role: string; content: string }>
}): string {
  const fromHistory = args.priorMessages.find((m) => m.role === "user")?.content
  if (args.isFirstUserTurn) {
    const t = args.currentPrompt.replace(/\s+/g, " ").trim()
    return t || args.currentPrompt
  }
  const t = (fromHistory ?? args.currentPrompt).replace(/\s+/g, " ").trim()
  return t || args.currentPrompt
}

function effectiveStoredTitle(raw: string | undefined): string | undefined {
  const t = raw?.replace(/\s+/g, " ").trim()
  if (!t || t === PLACEHOLDER_CHAT_TITLE) return undefined
  return t
}

/**
 * Chooses the title stored after each `/api/chat` turn. Treats sidebar `"New chat"` as unset so later
 * prompts can temporarily label the thread (and failed AI retries can resume).
 */
export function resolvePersistedChatTitle(args: {
  sessionId: string
  resolvedTitles: ReadonlyMap<string, string>
  sessions: ReadonlyArray<{ id: string; title: string }>
  isFirstUserTurn: boolean
  currentPrompt: string
}): string {
  const fromRef = effectiveStoredTitle(args.resolvedTitles.get(args.sessionId))
  if (fromRef) return fromRef
  const fromSidebar = effectiveStoredTitle(args.sessions.find((s) => s.id === args.sessionId)?.title)
  if (fromSidebar) return fromSidebar
  if (args.isFirstUserTurn) return PLACEHOLDER_CHAT_TITLE
  const p = args.currentPrompt.replace(/\s+/g, " ").trim()
  if (!p) return PLACEHOLDER_CHAT_TITLE
  return p.length > 48 ? `${p.slice(0, 45)}…` : p
}

/** Whether we should POST `/api/chat/session-title` for this thread. */
export function needsAiChatTitle(args: {
  sessionId: string
  aiTitleRequested: ReadonlySet<string>
  resolvedTitles: ReadonlyMap<string, string>
  sessions: ReadonlyArray<{ id: string; title: string }>
}): boolean {
  if (args.aiTitleRequested.has(args.sessionId)) return false
  const settled =
    effectiveStoredTitle(args.resolvedTitles.get(args.sessionId)) ??
    effectiveStoredTitle(args.sessions.find((s) => s.id === args.sessionId)?.title)
  return !settled
}

export function fallbackChatTitleFromFirstMessage(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim()
  if (!t) return PLACEHOLDER_CHAT_TITLE
  return t.length > 48 ? `${t.slice(0, 45)}…` : t
}

/** Model sometimes returns headings, chatter, or 1-letter junk—prefer substantive fallbacks. */
export function pickBestGeminiTitleLine(raw: string): string {
  const lines = raw
    .split(/\n/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^["'`]+/, "")
        .replace(/["'`]+$/, ""),
    )
    .filter(Boolean)
  if (lines.length === 0) return ""
  const stripLead = (s: string) => s.replace(/^(?:title|thread|subject)\s*:\s*/i, "").trim()
  let best = stripLead(lines[0]!)
  let bestScore = scoreTitleLine(best)
  for (const line of lines) {
    const candidate = stripLead(line)
    const score = scoreTitleLine(candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

const HAS_LETTER_OR_DIGIT = /[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF\u0590-\u05FF]+/

function scoreTitleLine(s: string): number {
  if (!s.trim()) return -1
  const words = s.split(" ").filter(Boolean)
  let score = Math.min(s.length, 72)
  if (words.length >= 3) score += 12
  else if (words.length === 2) score += 6
  if (/[#*_`>]/.test(s)) score -= 8
  if (/^[^A-Za-z0-9\u00C0-\u024F]+/.test(s)) score -= 4
  return score
}

export function isLikelyPoorChatTitle(candidate: string): boolean {
  const t = candidate.replace(/\s+/g, " ").trim()
  if (!t || t.length < 4) return true
  if (!HAS_LETTER_OR_DIGIT.test(t)) return true // punctuation-only / bare emoji
  const words = t.split(" ").filter(Boolean)
  // Single ultra-short tokens ("C", "Let") — allow 4+ char single words ("Love", "טבע")
  if (words.length === 1 && t.length <= 3) return true
  // Truncated label ("Wheel-", "Topic:")
  if (/[-–—:,]\s*$/u.test(t)) return true
  // Markdown heading crumbs
  if (/^#{1,6}\s*\w{1,3}$/.test(t)) return true
  return false
}

export function normalizeGeminiChatTitle(raw: string | undefined, fallbackFromUser: string): string {
  const fallback = () => fallbackChatTitleFromFirstMessage(fallbackFromUser)
  if (!raw) return fallback()
  const oneLine = pickBestGeminiTitleLine(raw)
  if (!oneLine) return fallback()
  const cleaned = oneLine.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "")
  if (!cleaned) return fallback()
  const capped = cleaned.length > 56 ? `${cleaned.slice(0, 53)}…` : cleaned
  return isLikelyPoorChatTitle(capped) ? fallback() : capped
}

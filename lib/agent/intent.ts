import type { ChatMessage, MutationPermissionState } from "@/lib/types"

const BUY_INTENT_PATTERNS = [
  /\b(buy|order|purchase|pick up)\b/i,
  /\bshop(?:ping)?\s+(?:for|my)\b/i,
  /\b(add|put)\b.{0,24}\bcart\b/i,
  /\bget\b.{0,16}\b(groceries|ingredients)\b/i,
  /\bgrab\b.{0,16}\b(groceries|ingredients|milk|eggs|bread)\b/i,
  /\bbuy\b.{0,40}\b(groceries|ingredients)\b/i,
  /\b(checkout|charge)\b.{0,20}\bcart\b/i,
]

/** Last N user messages scanned when deciding if this chat already expressed grocery buy intent. */
const BUY_INTENT_CONVERSATION_LOOKBACK = 14

export function hasExplicitBuyIntentInConversation(messages: ChatMessage[]): boolean {
  const userTurns = messages.filter((message) => message.role === "user").slice(-BUY_INTENT_CONVERSATION_LOOKBACK)
  return userTurns.some((message) => hasExplicitBuyIntent(message.content))
}

const VIDEO_HINT_PATTERNS = [/\byoutube\b/i, /\bvideo\b/i, /\btranscript\b/i, /\brecipe\b/i, /\bcooking\b/i]

const KROGER_HINT_PATTERNS = [/\bkroger\b/i, /\bcart\b/i, /\bgrocer(?:y|ies)\b/i, /\bbuy\b/i]
const CART_CLEAR_PATTERNS = [
  /\b(clear|empty)\b.{0,24}\bcart\b/i,
  /\bdelete\b.{0,24}\beverything\b.{0,24}\bcart\b/i,
  /\bremove\b.{0,24}\beverything\b.{0,24}\bcart\b/i,
]
const CART_REMOVE_PATTERNS = [
  /\b(remove|delete)\b.{0,40}\bfrom\b.{0,20}\bcart\b/i,
  /\b(remove|delete)\b.{0,20}\bcart\b/i,
]
const CART_QUANTITY_PATTERNS = [
  /\b(change|update|set|increase|decrease|adjust)\b.{0,30}\b(quantity|amount|count)\b/i,
  /\b(change|update|set|increase|decrease|adjust)\b.{0,40}\bin\b.{0,10}\bcart\b/i,
]
const CARRYOVER_CONTEXT_PATTERNS = [
  /\bbuy\s+(them|it)\b/i,
  /\badd\s+(them|it|the rest)\b/i,
  /\bbuy\s+the\s+rest\b/i,
  /\bfinish\b.{0,20}\b(cart|shopping|ingredients)\b/i,
  /\bcontinue\b.{0,20}\b(cart|shopping|recipe|ingredients)\b/i,
  /\bdid you\b.{0,24}\b(buy|add)\b.{0,24}\ball\b.{0,24}\bingredients\b/i,
  /\b(remaining|rest of the)\s+ingredients\b/i,
  /\b(that|this)\s+video\b/i,
  /\b(these|those)\s+ingredients\b/i,
  /\bhow did\b.{0,20}\bmake it\b/i,
  /\bhow do i make it\b/i,
  /\bwhat('?s| is)\s+in\s+it\b/i,
  /\bwhat ingredients\b/i,
  /^\s*transcript\??\s*$/i,
  /\bwhat does\b.{0,24}\btranscript\b.{0,24}\bsay\b/i,
  /\bwhat('?s| is)\s+the\s+transcript\b/i,
  /\bshow\b.{0,12}\b(transcript|captions?|cc)\b/i,
]
const CART_STATUS_PATTERNS = [
  /\bdid you\b.{0,24}\b(buy|add|get)\b.{0,24}\ball\b.{0,24}\bingredients\b/i,
  /\bdid you\b.{0,24}\bfinish\b.{0,24}\b(cart|shopping)\b/i,
  /\bis\b.{0,20}\b(cart|order)\b.{0,20}\bready\b/i,
  /\bwhat'?s\b.{0,20}\b(cart|shopping)\b.{0,20}\bstatus\b/i,
]
const VIDEO_CONTEXT_FOLLOWUP_PATTERNS = [
  /\bhow did\b.{0,20}\bmake it\b/i,
  /\bhow do i make it\b/i,
  /\bhow was it made\b/i,
  /\bwhat('?s| is)\s+in\s+it\b/i,
  /\bwhat ingredients\b/i,
  /\btell me more\b.{0,20}\b(video|recipe|it)\b/i,
  /\bhow does\b.{0,20}\bit\b.{0,20}\bwork\b/i,
  /^\s*transcript\??\s*$/i,
  /\bwhat does\b.{0,24}\btranscript\b.{0,24}\bsay\b/i,
  /\bwhat('?s| is)\s+the\s+transcript\b/i,
  /\bshow\b.{0,12}\b(transcript|captions?|cc)\b/i,
  /\bdoes\b.{0,16}\bit\b.{0,16}\bhave\b.{0,16}\b(transcript|captions?|cc)\b/i,
]

export function getLatestUserMessage(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index].content
    }
  }

  return ""
}

export function hasExplicitBuyIntent(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return BUY_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function getMutationPermissionState(messages: ChatMessage[]): MutationPermissionState {
  const latestUserMessage = getLatestUserMessage(messages)
  const latestAllows = hasExplicitBuyIntent(latestUserMessage)
  const conversationAllows = hasExplicitBuyIntentInConversation(messages)
  return {
    latestUserMessage,
    allowCartMutation: latestAllows || conversationAllows,
  }
}

export function suggestToolDomains(message: string): "youtube" | "kroger" | "hybrid" | "assistant_only" {
  const mentionsVideo = VIDEO_HINT_PATTERNS.some((pattern) => pattern.test(message))
  const mentionsKroger = KROGER_HINT_PATTERNS.some((pattern) => pattern.test(message))
  const buyIntent = hasExplicitBuyIntent(message)

  if ((mentionsVideo && mentionsKroger) || (mentionsVideo && buyIntent)) {
    return "hybrid"
  }

  if (mentionsVideo) {
    return "youtube"
  }

  if (mentionsKroger || buyIntent) {
    return "kroger"
  }

  return "assistant_only"
}

export function detectUnsupportedCartOperation(message: string): "clear_cart" | "remove_item" | "update_quantity" | null {
  if (CART_CLEAR_PATTERNS.some((pattern) => pattern.test(message))) {
    return "clear_cart"
  }

  if (CART_QUANTITY_PATTERNS.some((pattern) => pattern.test(message)) && /\bcart\b/i.test(message)) {
    return "update_quantity"
  }

  if (CART_REMOVE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "remove_item"
  }

  return null
}

export function shouldUseCarryoverContext(message: string) {
  return CARRYOVER_CONTEXT_PATTERNS.some((pattern) => pattern.test(message))
}

export function isCartStatusFollowup(message: string) {
  return CART_STATUS_PATTERNS.some((pattern) => pattern.test(message))
}

export function isVideoContextFollowup(message: string) {
  return VIDEO_CONTEXT_FOLLOWUP_PATTERNS.some((pattern) => pattern.test(message))
}

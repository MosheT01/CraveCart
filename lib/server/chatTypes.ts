export interface ChatSessionMeta {
  id: string
  title: string
  createdAt: number
}

export interface StoredChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  video: unknown | null
  cart: unknown | null
}

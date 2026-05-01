import { z } from "zod"

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
})

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
})

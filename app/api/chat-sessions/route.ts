import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { listSessions, replaceAllFromClient } from "@/lib/server/chatHistoryStore"
import type { StoredChatMessage } from "@/lib/server/chatHistoryStore"

export const runtime = "nodejs"

const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  video: z.unknown().nullable(),
  cart: z.unknown().nullable(),
})

const importSchema = z.object({
  sessions: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        createdAt: z.number(),
      }),
    )
    .max(80),
  messagesBySession: z.record(z.string(), z.array(storedMessageSchema)).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const sessions = await listSessions(user.id)
  return NextResponse.json({ sessions })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  let body: z.infer<typeof importSchema>
  try {
    body = importSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const messagesBySession: Record<string, StoredChatMessage[]> = {}
  for (const [k, v] of Object.entries(body.messagesBySession ?? {})) {
    messagesBySession[k] = v as StoredChatMessage[]
  }
  await replaceAllFromClient(user.id, body.sessions, messagesBySession)
  return NextResponse.json({ ok: true })
}

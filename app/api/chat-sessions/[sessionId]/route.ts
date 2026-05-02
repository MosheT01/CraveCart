import { NextResponse } from "next/server"
import { z } from "zod"

import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import type { StoredChatMessage } from "@/lib/server/chatTypes"
import { getSessionMessages, upsertSessionBundle } from "@/lib/server/chatFirestore"

export const runtime = "nodejs"

const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  video: z.unknown().nullable(),
  cart: z.unknown().nullable(),
})

const putSchema = z.object({
  title: z.string().min(1).max(200),
  messages: z.array(storedMessageSchema),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const { sessionId } = await context.params
  const messages = await getSessionMessages(user.id, sessionId)
  return NextResponse.json({ messages })
}

export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const { sessionId } = await context.params

  let body: z.infer<typeof putSchema>
  try {
    body = putSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  await upsertSessionBundle(user.id, sessionId, body.title, body.messages as StoredChatMessage[])
  return NextResponse.json({ ok: true })
}

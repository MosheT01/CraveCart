import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"

import { setKrogerSessionCookie } from "@/lib/kroger/session"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { setKrogerMcpSessionId } from "@/lib/server/krogerUserPrefs"
import { syncKrogerBrowserSessionForUser } from "@/lib/server/krogerSessionSync"

export const runtime = "nodejs"

export async function POST() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const prior = await syncKrogerBrowserSessionForUser(user.id)
  try {
    const client = new KrogerClient({ sessionId: prior })
    await client.clearRemoteSession()
  } catch {
    // Continue: rotate Firestore + cookie so the next connect is a fresh Kroger login.
  }

  const nextId = randomUUID()
  await setKrogerMcpSessionId(user.id, nextId)
  await setKrogerSessionCookie(nextId)

  return NextResponse.json({ ok: true as const })
}

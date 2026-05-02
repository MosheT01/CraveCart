import { NextResponse } from "next/server"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { ensureSessionId } from "@/lib/kroger/session"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { syncKrogerBrowserSessionForUser } from "@/lib/server/krogerSessionSync"

export async function POST() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Sign in to connect Kroger." }, { status: 401 })
  }

  try {
    await syncKrogerBrowserSessionForUser(user.id)
    const sessionId = await ensureSessionId()
    const client = new KrogerClient({ sessionId })
    const authUrl = await client.getAuthorizationUrl()
    return NextResponse.json({ authUrl })
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Could not start Kroger OAuth.",
      },
      { status: 500 },
    )
  }
}

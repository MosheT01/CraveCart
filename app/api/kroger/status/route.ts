import { NextResponse } from "next/server"

import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { syncKrogerBrowserSessionForUser } from "@/lib/server/krogerSessionSync"

export const runtime = "nodejs"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      configured: false,
      needsFirebaseAuth: true as const,
    })
  }

  const sessionId = await syncKrogerBrowserSessionForUser(user.id)
  const client = new KrogerClient({ sessionId })
  const st = await client.getSessionOAuthStatus()

  return NextResponse.json({
    authenticated: Boolean(st.authenticated),
    configured: Boolean(st.configured),
    needsFirebaseAuth: false as const,
  })
}

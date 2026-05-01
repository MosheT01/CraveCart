import { NextResponse } from "next/server"
import { isMockKrogerMode } from "@/lib/env"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { ensureSessionId } from "@/lib/kroger/session"

export async function POST() {
  try {
    const sessionId = await ensureSessionId()

    if (isMockKrogerMode()) {
      return NextResponse.json({
        mockMode: true,
        authUrl: "/",
      })
    }

    const client = new KrogerClient({ sessionId })
    const authUrl = await client.getAuthorizationUrl()

    return NextResponse.json({
      mockMode: false,
      authUrl,
    })
  } catch (error) {
    return NextResponse.json(
      {
        mockMode: false,
        message: error instanceof Error ? error.message : "Could not start Kroger OAuth.",
      },
      { status: 500 },
    )
  }
}

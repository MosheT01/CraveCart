import { NextResponse } from "next/server"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { ensureSessionId } from "@/lib/kroger/session"

export async function POST() {
  try {
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

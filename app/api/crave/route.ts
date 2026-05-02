import { NextResponse } from "next/server"
import { handleCraveRequest } from "@/lib/api/handleCraveRequest"
import { craveRequestSchema } from "@/lib/llm/schemas"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { ensureSessionId } from "@/lib/kroger/session"
import { syncKrogerBrowserSessionForUser } from "@/lib/server/krogerSessionSync"

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ status: "error", message: "Sign in required." }, { status: 401 })
  }

  try {
    const payload = craveRequestSchema.parse(await request.json())
    await syncKrogerBrowserSessionForUser(user.id)
    const sessionId = await ensureSessionId()
    const response = await handleCraveRequest(payload, sessionId)
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Invalid request payload.",
      },
      { status: 400 },
    )
  }
}

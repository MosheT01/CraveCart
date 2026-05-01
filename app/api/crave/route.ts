import { NextResponse } from "next/server"
import { handleCraveRequest } from "@/lib/api/handleCraveRequest"
import { craveRequestSchema } from "@/lib/llm/schemas"
import { ensureSessionId } from "@/lib/kroger/session"

export async function POST(request: Request) {
  try {
    const payload = craveRequestSchema.parse(await request.json())
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

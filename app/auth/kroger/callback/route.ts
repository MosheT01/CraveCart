import { NextResponse } from "next/server"
import { getAppBaseUrl } from "@/lib/env"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { readSessionId } from "@/lib/kroger/session"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const sessionId = await readSessionId()

  if (error) {
    return redirectWithStatus("error", error)
  }

  if (!code || !state || !sessionId) {
    return redirectWithStatus("error", "Missing OAuth callback parameters or session.")
  }

  try {
    const client = new KrogerClient({ sessionId })
    const response = await client.exchangeCodeForToken(code, state)

    if (!response.connected) {
      return redirectWithStatus("error", "Kroger authorization did not complete.")
    }

    return NextResponse.redirect(new URL("/auth/kroger?status=connected", getAppBaseUrl()))
  } catch (callbackError) {
    return redirectWithStatus("error", callbackError instanceof Error ? callbackError.message : "Kroger authorization failed.")
  }
}

function redirectWithStatus(status: string, message: string) {
  const target = new URL("/auth/kroger", getAppBaseUrl())
  target.searchParams.set("status", status)
  target.searchParams.set("message", message)
  return NextResponse.redirect(target)
}

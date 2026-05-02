import { cookies } from "next/headers"
import { randomUUID } from "node:crypto"

import { useSecureSessionCookies } from "@/lib/env"

export const SESSION_COOKIE_NAME = "cravecart_session"

export async function ensureSessionId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (existing) {
    return existing
  }

  const sessionId = randomUUID()
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, krogerSessionCookieOptions())

  return sessionId
}

export function krogerSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: useSecureSessionCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  }
}

/** Sets the Kroger MCP session cookie to an explicit id (per-user sync from Firestore). */
export async function setKrogerSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, krogerSessionCookieOptions())
}

export async function readSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
}

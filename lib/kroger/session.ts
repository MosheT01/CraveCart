import { cookies } from "next/headers"
import { randomUUID } from "node:crypto"

export const SESSION_COOKIE_NAME = "cravecart_session"

export async function ensureSessionId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (existing) {
    return existing
  }

  const sessionId = randomUUID()
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, COOKIE_OPTIONS)

  return sessionId
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
}

/** Sets the Kroger MCP session cookie to an explicit id (per-user sync from Firestore). */
export async function setKrogerSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, COOKIE_OPTIONS)
}

export async function readSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
}

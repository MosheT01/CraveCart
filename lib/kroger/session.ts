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
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  return sessionId
}

export async function readSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null
}

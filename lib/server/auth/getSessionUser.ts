import { cookies } from "next/headers"

import { AUTH_COOKIE_NAME, verifySessionCookie } from "@/lib/server/auth/sessionCookie"

export interface PublicUser {
  id: string
  email: string
  name: string
}

export async function getSessionUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (!raw) return null
  const payload = verifySessionCookie(raw)
  if (!payload) return null
  return { id: payload.sub, email: payload.email, name: payload.name }
}

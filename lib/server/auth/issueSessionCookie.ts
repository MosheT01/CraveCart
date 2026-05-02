import { cookies } from "next/headers"

import { AUTH_COOKIE_NAME, authCookieOptions, signSessionCookie } from "@/lib/server/auth/sessionCookie"
import type { UserRecord } from "@/lib/server/auth/userStore"

const WEEK = 60 * 60 * 24 * 7

export async function setLoggedInCookies(user: UserRecord): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + WEEK
  const token = signSessionCookie({
    sub: user.id,
    email: user.email,
    name: user.name,
    exp,
  })
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, token, authCookieOptions())
}

export async function clearLoggedInCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, "", { ...authCookieOptions(), maxAge: 0 })
}

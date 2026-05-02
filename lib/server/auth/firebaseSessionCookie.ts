import { cookies } from "next/headers"

import type { PublicUser } from "@/lib/server/auth/publicUser"
import { firebaseAdminConfigured, getFirebaseAdminAuth } from "@/lib/server/firebase/admin"

/** HTTP-only Firebase Auth session cookie set by /api/auth/session. */
export const FIREBASE_SESSION_COOKIE = "cravecart_fb_session"

const WEEK_MS = 1000 * 60 * 60 * 24 * 7

export function firebaseSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(WEEK_MS / 1000),
  }
}

export async function setFirebaseSessionCookieFromIdToken(idToken: string): Promise<void> {
  const auth = getFirebaseAdminAuth()
  await auth.verifyIdToken(idToken)
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: WEEK_MS })
  const cookieStore = await cookies()
  cookieStore.set(FIREBASE_SESSION_COOKIE, sessionCookie, firebaseSessionCookieOptions())
}

export async function clearFirebaseSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(FIREBASE_SESSION_COOKIE, "", { ...firebaseSessionCookieOptions(), maxAge: 0 })
}

export async function getUserFromFirebaseSessionCookie(): Promise<PublicUser | null> {
  if (!firebaseAdminConfigured()) return null
  const cookieStore = await cookies()
  const raw = cookieStore.get(FIREBASE_SESSION_COOKIE)?.value
  if (!raw) return null
  try {
    const auth = getFirebaseAdminAuth()
    const decoded = await auth.verifySessionCookie(raw, true)
    const displayName = decoded.name?.trim() ?? ""
    const email = decoded.email?.trim() ?? ""
    return {
      id: decoded.uid,
      email,
      name: displayName || email.split("@")[0] || "User",
    }
  } catch {
    return null
  }
}

import { createHmac, timingSafeEqual } from "node:crypto"
import { getAuthSecret } from "@/lib/server/auth/secret"

export const AUTH_COOKIE_NAME = "cravecart_auth"

export interface SessionPayload {
  sub: string
  email: string
  name: string
  /** epoch seconds */
  exp: number
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(raw: string): SessionPayload | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const v = JSON.parse(json) as SessionPayload
    if (typeof v.sub !== "string" || typeof v.email !== "string" || typeof v.name !== "string" || typeof v.exp !== "number")
      return null
    return v
  } catch {
    return null
  }
}

export function signSessionCookie(payload: SessionPayload): string {
  const secret = getAuthSecret()
  const body = encodePayload(payload)
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifySessionCookie(token: string): SessionPayload | null {
  const idx = token.lastIndexOf(".")
  if (idx <= 0) return null
  const body = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const secret = getAuthSecret()
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const payload = decodePayload(body)
  if (!payload) return null
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  }
}

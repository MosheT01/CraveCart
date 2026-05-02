import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { normalizeEmail, findUserByEmailNorm, setPasswordResetToken } from "@/lib/server/auth/userStore"

export const runtime = "nodejs"

const bodySchema = z.object({
  email: z.string().email(),
})

const RESET_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const emailNorm = normalizeEmail(parsed.email)
  const user = await findUserByEmailNorm(emailNorm)
  /** Always generic response to avoid email enumeration — except we may leak resetToken in dev. */
  const generic = NextResponse.json({ ok: true as const })

  if (!user) {
    return generic
  }

  const token = randomUUID() + randomUUID()
  const expiresAt = Date.now() + RESET_MS
  await setPasswordResetToken(user.id, token, expiresAt)

  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "") || "http://localhost:3000"
  const resetUrl = `${base}/auth/reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}`

  if (process.env.NODE_ENV !== "production") {
    console.info(`[cravecart-auth] Password reset link for ${user.email}: ${resetUrl}`)
  }

  /** Hackathon/demo: expose token in JSON only outside production so QA can paste the link without SMTP. */
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true as const, devResetUrl: resetUrl })
  }

  return generic
}

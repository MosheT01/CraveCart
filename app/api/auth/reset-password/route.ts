import { NextResponse } from "next/server"
import { z } from "zod"

import { finalizePasswordReset, normalizeEmail } from "@/lib/server/auth/userStore"

export const runtime = "nodejs"

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(8),
  password: z.string().min(8).max(128),
})

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const ok = await finalizePasswordReset(normalizeEmail(parsed.email), parsed.token, parsed.password)
  if (!ok) {
    return NextResponse.json({ error: "Reset link invalid or expired. Request a new one." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

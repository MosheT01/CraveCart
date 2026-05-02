import { NextResponse } from "next/server"
import { z } from "zod"

import { setFirebaseSessionCookieFromIdToken } from "@/lib/server/auth/firebaseSessionCookie"
import { firebaseAdminConfigured } from "@/lib/server/firebase/admin"

export const runtime = "nodejs"

const bodySchema = z.object({
  idToken: z.string().min(1),
})

export async function POST(request: Request) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin is not configured on the server." }, { status: 503 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  try {
    await setFirebaseSessionCookieFromIdToken(parsed.idToken)
    return NextResponse.json({ ok: true as const })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Session failed."
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}

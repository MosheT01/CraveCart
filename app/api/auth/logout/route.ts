import { NextResponse } from "next/server"

import { clearFirebaseSessionCookie } from "@/lib/server/auth/firebaseSessionCookie"

export const runtime = "nodejs"

export async function POST() {
  await clearFirebaseSessionCookie()
  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"

import { clearLoggedInCookies } from "@/lib/server/auth/issueSessionCookie"

export const runtime = "nodejs"

export async function POST() {
  await clearLoggedInCookies()
  return NextResponse.json({ ok: true })
}

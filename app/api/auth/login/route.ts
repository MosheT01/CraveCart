import { NextResponse } from "next/server"
import { z } from "zod"

import { setLoggedInCookies } from "@/lib/server/auth/issueSessionCookie"
import { verifyUserLogin } from "@/lib/server/auth/userStore"

export const runtime = "nodejs"

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const user = await verifyUserLogin(parsed.email, parsed.password)
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 })
  }

  await setLoggedInCookies(user)
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
}

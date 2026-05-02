import { NextResponse } from "next/server"
import { z } from "zod"

import { setLoggedInCookies } from "@/lib/server/auth/issueSessionCookie"
import { createUser } from "@/lib/server/auth/userStore"

export const runtime = "nodejs"

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  try {
    const user = await createUser(parsed)
    await setLoggedInCookies(user)
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 })
    }
    throw e
  }
}

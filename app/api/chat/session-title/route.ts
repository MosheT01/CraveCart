import { NextResponse } from "next/server"
import { z } from "zod"

import { extractResponseText, getGeminiClient } from "@/lib/agent/gemini"
import { getGeminiModel, isGeminiConfigured } from "@/lib/env"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"

export const runtime = "nodejs"

const bodySchema = z.object({
  firstMessage: z.string().min(1).max(8000),
})

function fallbackTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim()
  if (!t) return "New chat"
  return t.length > 48 ? `${t.slice(0, 45)}…` : t
}

function normalizeTitle(raw: string | undefined, fallbackFromUser: string): string {
  if (!raw) return fallbackTitle(fallbackFromUser)
  const oneLine = raw.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "")
  if (!oneLine) return fallbackTitle(fallbackFromUser)
  return oneLine.length > 56 ? `${oneLine.slice(0, 53)}…` : oneLine
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ title: fallbackTitle(parsed.firstMessage) })
  }

  try {
    const client = getGeminiClient()
    const prompt = [
      "You title chat threads for a grocery and recipe assistant (CraveCart).",
      "Reply with ONLY a short thread title: 3 to 8 words, no quotation marks, no trailing punctuation flourish.",
      "Focus on dish, craving, or shopping intent.",
      "",
      `User first message:\n${parsed.firstMessage}`,
    ].join("\n")

    const response = await client.models.generateContent({
      model: getGeminiModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 48 },
    })

    const text = extractResponseText(response)
    return NextResponse.json({ title: normalizeTitle(text, parsed.firstMessage) })
  } catch {
    return NextResponse.json({ title: fallbackTitle(parsed.firstMessage) })
  }
}

import { getGeminiClient } from "@/lib/agent/gemini"
import { getGeminiModel, isGeminiConfigured } from "@/lib/env"

interface ChatMessage {
  role: "system" | "user"
  content: string
}

export async function callJsonLlm(messages: ChatMessage[]): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY is not configured.")
  }

  const client = getGeminiClient()
  const systemMessage = messages.find((message) => message.role === "system")?.content ?? ""
  const userPrompt = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n")

  const response = await client.models.generateContent({
    model: getGeminiModel(),
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemMessage,
      responseMimeType: "application/json",
    },
  })

  const content = typeof response.text === "string" ? response.text.trim() : ""
  if (content) {
    return content
  }

  throw new Error("Gemini response did not include JSON text.")
}

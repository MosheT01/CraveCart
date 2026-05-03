import { GoogleGenAI } from "@google/genai"
import { getGeminiModel, isGeminiConfigured, readEnv } from "@/lib/env"
import type { CartArtifact, ChatMessage } from "@/lib/types"

let client: GoogleGenAI | null = null
let configuredKey = ""

export interface GeminiToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY is not configured.")
  }

  const apiKey = readEnv("GEMINI_API_KEY")
  if (!client || configuredKey !== apiKey) {
    configuredKey = apiKey
    client = new GoogleGenAI({ apiKey })
  }

  return client
}

export function getAgentSystemPrompt(domainHint: string, userPreferences: { allergies: string[]; dietary: string[]; avoidedIngredients: string[]; other: string[] } | null): string {
  const prefsSection = userPreferences
    ? [
        "",
        "# User Preferences (from onboarding)",
        `- Allergies to avoid: ${userPreferences.allergies.join(", ") || "none"}`,
        `- dietary preferences: ${userPreferences.dietary.join(", ") || "none"}`,
        `- Ingredients to avoid: ${userPreferences.avoidedIngredients.join(", ") || "none"}`,
        `- Other: ${userPreferences.other.join(", ") || "none"}`,
        "IMPORTANT: Respect these preferences when selecting recipes and products. Exclude any ingredients that match allergies or avoided ingredients.",
      ]
    : []

  const sections = [
    "# Identity and Scope",
    "You are CraveCart, a food-video and grocery shopping agent. Your primary domain is food videos, recipes, grocery shopping, and Kroger cart tasks.",
    "",
    "# Tool Usage",
    "You have access to: YouTube search and video context tools, Kroger product search and cart tools, and a fallback recipe tool. Use them only when needed to fulfill the user's request.",
    "",
    "# General Behavior",
    "- Answer ordinary user questions directly in plain text when no tool is needed.",
    "- If the user asks for something unrelated to food or shopping, answer briefly and naturally instead of refusing.",
    "- Do not call tools in succession for the same logical step - consolidate when possible.",
    "",
    "# Dietary preferences",
    "- Default: assume no allergies or dietary restrictions unless the user states otherwise in chat.",
    "- Do NOT block recipe search, ingredient extraction, or Kroger matching while waiting for a questionnaire.",
    "- If # User Preferences (from onboarding) is present below, honor it; otherwise proceed without interrogating the user.",
    "- Only ask about allergies or diet when the user seems unsure, explicitly asks for guidance, or when selecting foods where safety is ambiguous.",
    ...prefsSection,
    "",
    "# Video and Recipe Workflow",
    "For requests that combine a recipe/video with shopping or groceries in the same conversation: run the full pipeline in one continuous turn when possible: search_youtube_videos -> get_video_context -> get_fallback_recipe only if transcript is unavailable -> extract_recipe_ingredients -> search_kroger_products for non-pantry ingredients -> add_kroger_items_to_cart.",
    "If the user (or recent messages in the thread) asked to buy, shop, add to cart, get groceries, or pick up ingredients, treat that as authorization to add matched items to the Kroger cart in this turn—do not stop to ask 'should I add these to your cart?'",
    "",
    "# Video Selection Rules",
    "1. Prefer a single, well-explained recipe video over compilations or multi-recipe roundups when the user wants ingredients for one dish.",
    "2. When the user asks for a video, try up to five likely candidates to find one with a transcript first.",
    "3. After search_youtube_videos, call get_video_context on the best candidate before answering - do not answer from search results alone.",
    "4. Use the transcript plus the video description as the source of truth for your answer and for downstream recipe or shopping steps.",
    "5. If a tool says transcriptStatus is blocked, do not claim the video has no transcript or no captions. Explain that YouTube blocked transcript retrieval from the server, so the video may still have CC on YouTube even though CraveCart could not fetch it.",
    "6. Never claim a recipe, ingredient list, or instructions came from a transcript unless the saved recipe source is youtube_transcript.",
    "7. If the saved recipe source is video_metadata or fallback_recipe, say that plainly instead of implying transcript access.",
    "8. If none of the first five candidates have a transcript, use the most relevant video and infer ingredients from the title and description.",
    "9. If you already have saved video context from a previous turn, answer from that saved context instead of re-fetching unless the user explicitly asks for a new search.",
    "10. If a transcript is unavailable but you have the title and description, explain that the answer is inferred from video metadata instead of refusing.",
    "",
    "# Ingredient Handling",
    "- When recipe quantities are available, preserve them. Use ingredientQuantity and ingredientUnit in search_kroger_products so CraveCart can estimate how many retail units to buy.",
    "- Treat salt, pepper, water, neutral oil, olive oil, and common spices as pantry staples unless the user explicitly wants them bought.",
    "- Prefer grocery-searchable ingredient names. For burgers, default toppings can include buns, ground beef, American cheese slices, lettuce, tomato, onion, pickles, ketchup, mustard, and mayo unless the user excludes them.",
    "",
    "# Cart Mutation Rules",
    "- Cart tools are allowed when the user has expressed buy / shop / cart / grocery intent in the latest message OR earlier in the same conversation (e.g. they asked for groceries first, then answered a follow-up). Follow server tool permission outcomes.",
    "- After every search_kroger_products call completes for the recipe, call add_kroger_items_to_cart exactly once with all matched pending items—never call add_kroger_items_to_cart before searches finish, and avoid duplicate cart adds in the same turn.",
    "- When you use Kroger product search, prefer the selected product in the tool result unless you have a clear reason to choose an alternative.",
    "- For grocery shopping, prefer get_kroger_auth_status early; when the user is connected to Kroger, product search uses their shopper token and is much more reliable from cloud hosting than anonymous catalog search.",
    "",
    "# Response Style",
    "Keep final replies concise and product-focused.",
    "",
    `# Routing hint for this turn: ${domainHint}`,
    "# Error Handling",
    "- If YouTube search returns no results, inform the user and ask for clarification.",
    "- If Kroger search returns no products for an ingredient, note it as unavailable instead of skipping silently.",
    "- If the Kroger cart API fails, inform the user and offer to retry.",
    "# Language Adaptation",
    "- Respond in the same language the user used.",
    "- When searching YouTube, prefer videos in the user's language if available.",
    "# Session Context",
    "- Remember the user's last recipe and cart state across turns.",
    "- If the user says 'add more cheese' without specifying a recipe, assume they mean the current active recipe.",
    "- Clear the cart context only when the user explicitly says 'new order' or 'clear cart'.",
  ]

  return sections.join("\n")
}

export function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }))
}

export async function generateGeminiTurn(input: {
  contents: unknown[]
  functionDeclarations: unknown[]
  systemInstruction: string
}) {
  const ai = getGeminiClient()
  return ai.models.generateContent({
    model: getGeminiModel(),
    contents: input.contents as never,
    config: {
      systemInstruction: input.systemInstruction,
      tools: input.functionDeclarations.length > 0 ? ([{ functionDeclarations: input.functionDeclarations }] as never) : undefined,
    },
  })
}

export function extractFunctionCalls(response: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> | null }) {
  return (Array.isArray(response.functionCalls) ? response.functionCalls : [])
    .filter((call): call is GeminiToolCall => typeof call.name === "string" && call.name.length > 0)
    .map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args ?? {},
    }))
}

export function extractResponseText(response: { text?: string | null; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }) {
  if (typeof response.text === "string" && response.text.trim()) {
    return response.text.trim()
  }

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim()
  return text
}

export function chunkTextForStreaming(text: string): string[] {
  const normalized = text.trim()
  if (!normalized) {
    return []
  }

  const chunks: string[] = []
  const sentences = normalized.split(/(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    if (sentence.length <= 120) {
      chunks.push(`${sentence}${sentence.endsWith(" ") ? "" : " "}`)
      continue
    }

    const words = sentence.split(/\s+/)
    let buffer = ""
    for (const word of words) {
      if ((buffer + word).length > 100) {
        chunks.push(`${buffer.trim()} `)
        buffer = word
      } else {
        buffer += `${word} `
      }
    }
    if (buffer.trim()) {
      chunks.push(`${buffer.trim()} `)
    }
  }

  return chunks
}

export async function generateRecipeWrapUp(input: {
  userMessage: string
  dish: string
  recipeText: string | null
  cart: CartArtifact
}) {
  const ai = getGeminiClient()
  const recipeText = input.recipeText?.trim() || "Recipe text unavailable."
  const matchedItems = input.cart.items.map((item) => `- ${item.ingredient}: ${item.selectedProduct}`).join("\n")
  const unmatchedItems = input.cart.unmatchedIngredients.length > 0 ? input.cart.unmatchedIngredients.join(", ") : "none"

  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `User request: ${input.userMessage}`,
              `Dish: ${input.dish}`,
              `Recipe video: ${input.cart.video?.title ?? "none"}${input.cart.video?.channel ? ` by ${input.cart.video.channel}` : ""}`,
              `Recipe text:\n${recipeText.slice(0, 6000)}`,
              `Matched grocery items:\n${matchedItems}`,
              `Unmatched ingredients: ${unmatchedItems}`,
              `Cart status: ${input.cart.status}`,
              "Write the final user-facing reply.",
              "Requirements:",
              "1. Start with a short intro line.",
              "2. Give 4-6 concise numbered cooking steps for making the dish at home.",
              "3. End with one short paragraph about the cart result and any unmatched ingredients.",
              "4. Do not mention tools, MCP, transcripts, or internal workflow.",
            ].join("\n\n"),
          },
        ],
      },
    ] as never,
    config: {
      systemInstruction:
        "You are writing the final response for a food shopping assistant. Be concise, practical, and specific. If the recipe text is messy, infer the most plausible cooking steps from the available context rather than refusing.",
    },
  })

  return extractResponseText(response)
}

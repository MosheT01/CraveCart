import { devLog } from "@/lib/dev"
import { isGeminiConfigured } from "@/lib/env"
import type { ExtractedRecipe } from "@/lib/types"
import { callJsonLlm } from "@/lib/llm/client"
import { extractedRecipeSchema } from "@/lib/llm/schemas"

interface ExtractIngredientsInput {
  recipeText: string
  dish: string
  servings: number
  fallbackStructuredRecipe?: ExtractedRecipe | null
}

const SYSTEM_PROMPT =
  "You are a precise recipe-to-grocery-list extraction engine. Return strict JSON only. Do not include markdown. Do not include commentary."

function buildUserPrompt(recipeText: string, dish: string, servings: number): string {
  return `Extract a grocery shopping list from the following recipe transcript or recipe text.

Target dish:
${dish}

Target servings:
${servings}

Rules:
- Return only valid JSON matching the provided schema.
- Normalize each ingredient to a grocery-searchable product name.
- Exclude cookware and equipment.
- Mark water, salt, pepper, basic cooking oil, and common spices as pantryItem=true unless they are a central ingredient.
- Prefer purchasable supermarket terms.
- Infer reasonable missing burger toppings only for burger recipes.
- Focus on one coherent recipe for the target dish.
- If the video covers multiple variations, pick the most standard or central version of the target dish and ignore unrelated variations, sides, sauces, drinks, and bonus recipes unless the user explicitly asked for all of them.
- Ignore optional cocktails, desserts, and side dishes unless they are essential to the target dish.
- If the input is only a video title and description with no transcript, infer the most plausible ingredient list for the target dish from that metadata. Do not refuse just because the transcript is unavailable.
- Default servings to 4 if unclear.
- If a quantity is unclear, set quantity to null.
- Keep ingredients separate. Do not combine unrelated items.

Schema:
{
  "dish": "string",
  "servings": number,
  "ingredients": [
    {
      "name": "string",
      "normalizedName": "string",
      "quantity": number | null,
      "unit": "string | null",
      "category": "meat|dairy|produce|bakery|pantry|frozen|beverage|other",
      "required": boolean,
      "pantryItem": boolean,
      "notes": "string | null"
    }
  ],
  "pantryAssumptions": ["string"],
  "instructionsSummary": "string"
}

Recipe text:
${recipeText}`
}

export async function extractIngredients({
  recipeText,
  dish,
  servings,
  fallbackStructuredRecipe,
}: ExtractIngredientsInput): Promise<ExtractedRecipe> {
  if (!isGeminiConfigured()) {
    if (fallbackStructuredRecipe) {
      devLog("llm_missing_using_structured_fallback", { dish })
      return fallbackStructuredRecipe
    }

    throw new Error("GEMINI_API_KEY is not configured and no structured fallback recipe is available.")
  }

  const primaryResponse = await callJsonLlm([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(recipeText, dish, servings) },
  ])

  const primaryParse = parseRecipeJson(primaryResponse, dish, servings)

  if (primaryParse) {
    return primaryParse
  }

  devLog("llm_parse_retry", { dish })

  const repairPrompt = `The previous output did not validate. Fix it and return valid JSON only.

Target dish: ${dish}
Target servings: ${servings}

Bad JSON:
${primaryResponse}

Original recipe text:
${recipeText}`

  const repairedResponse = await callJsonLlm([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: repairPrompt },
  ])

  const repairedParse = parseRecipeJson(repairedResponse, dish, servings)

  if (repairedParse) {
    return repairedParse
  }

  if (fallbackStructuredRecipe) {
    devLog("llm_repair_failed_using_structured_fallback", { dish })
    return fallbackStructuredRecipe
  }

  throw new Error("Could not validate ingredient extraction output.")
}

function parseRecipeJson(raw: string, fallbackDish: string, fallbackServings: number): ExtractedRecipe | null {
  try {
    const parsed = JSON.parse(raw)
    const result = extractedRecipeSchema.safeParse(parsed)

    if (!result.success) {
      return null
    }

    return {
      ...result.data,
      dish: result.data.dish || fallbackDish,
      servings: result.data.servings || fallbackServings || 4,
    }
  } catch {
    return null
  }
}

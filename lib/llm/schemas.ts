import { z } from "zod"

export const ingredientCategorySchema = z.enum([
  "meat",
  "dairy",
  "produce",
  "bakery",
  "pantry",
  "frozen",
  "beverage",
  "other",
])

export const extractedIngredientSchema = z.object({
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  category: ingredientCategorySchema,
  required: z.boolean(),
  pantryItem: z.boolean(),
  notes: z.string().nullable(),
})

export const extractedRecipeSchema = z.object({
  dish: z.string().min(1),
  servings: z.number().int().positive(),
  ingredients: z.array(extractedIngredientSchema).min(1),
  pantryAssumptions: z.array(z.string()),
  instructionsSummary: z.string().min(1),
})

export const craveRequestSchema = z.object({
  craving: z.string().min(1),
  servings: z.number().int().positive().max(20).optional().default(4),
})

export type ExtractedRecipeSchema = z.infer<typeof extractedRecipeSchema>

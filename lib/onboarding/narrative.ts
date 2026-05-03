/**
 * Frontend-only stub for onboarding narrative content.
 * Contains the text and structure for the onboarding tour.
 */

import { ShoppingCart, ListChecks, Truck, type LucideIcon } from "lucide-react"

export interface OnboardingStep {
  title: string
  body: string
  micro: string
  icon: LucideIcon
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Tell us what you're craving",
    body: "CraveCart uses AI to understand your food cravings, dietary preferences, and recipe requests. Just type naturally — we'll figure out the rest.",
    micro: "AI analyzes your request and finds the perfect recipe match from YouTube.",
    icon: ShoppingCart,
  },
  {
    title: "We build your grocery list",
    body: "Once we find a recipe, CraveCart extracts ingredients and matches them to real Kroger products available at your local store.",
    micro: "Your credentials stay secure — Kroger OAuth means your password never touches CraveCart servers.",
    icon: ListChecks,
  },
  {
    title: "One-click to Kroger checkout",
    body: "With your Kroger account linked, we can add items directly to your cart. Choose pickup or delivery, then checkout on Kroger's site.",
    micro: "Select pickup or delivery, confirm your time slot, and complete checkout directly on Kroger.",
    icon: Truck,
  },
]

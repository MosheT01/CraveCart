import { Link2, Sparkles, Truck } from "lucide-react"

export const ONBOARDING_STEPS = [
  {
    id: "capture",
    icon: Link2,
    title: "Tell us your diet crave or paste a recipe video",
    body: "Sign into CraveCart first, then you can paste a craving in plain English, add nutrition goals, or drop a YouTube link.",
    micro: "Example: \"High-protein chicken pasta under 30 minutes.\"",
  },
  {
    id: "gather",
    icon: Sparkles,
    title: "AI gathers the recipe intel and fills your Kroger cart",
    body: "We extract ingredients and map them to real Kroger products. That needs a quick Kroger sign-in (OAuth) — your Kroger password never passes through CraveCart.",
    micro: "Live parser + ingredient matching + cart-ready output.",
  },
  {
    id: "checkout",
    icon: Truck,
    title: "Sign in to Kroger once — then pickup or delivery stays on Kroger",
    body: "After linking Kroger from the banner or prompt, checkout and payment happen on Kroger’s site — we connect your agent run to inventory and cart.",
    micro: "Faster meal planning, less wandering aisles.",
  },
] as const

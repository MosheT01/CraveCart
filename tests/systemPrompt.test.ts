import { describe, expect, it } from "vitest"
import { getAgentSystemPrompt } from "@/lib/agent/gemini"

describe("system prompt", () => {
  it("includes identity section", () => {
    const prompt = getAgentSystemPrompt("youtube", null)
    expect(prompt).toContain("CraveCart")
    expect(prompt).toContain("food-video and grocery shopping agent")
  })

  it("includes tool usage section", () => {
    const prompt = getAgentSystemPrompt("kroger", null)
    expect(prompt).toContain("YouTube")
    expect(prompt).toContain("Kroger")
    expect(prompt).toContain("fallback recipe")
  })

  it("includes workflow instructions", () => {
    const prompt = getAgentSystemPrompt("hybrid", null)
    expect(prompt).toContain("search_youtube_videos")
    expect(prompt).toContain("get_video_context")
    expect(prompt).toContain("extract_recipe_ingredients")
    expect(prompt).toContain("add_kroger_items_to_cart")
  })

  it("includes cart mutation rules", () => {
    const prompt = getAgentSystemPrompt("kroger", null)
    expect(prompt).toContain("Cart tools are allowed when")
    expect(prompt).toContain("add_kroger_items_to_cart exactly once")
  })

  it("includes routing hint", () => {
    expect(getAgentSystemPrompt("youtube", null)).toContain("Routing hint for this turn: youtube")
    expect(getAgentSystemPrompt("kroger", null)).toContain("Routing hint for this turn: kroger")
    expect(getAgentSystemPrompt("hybrid", null)).toContain("Routing hint for this turn: hybrid")
    expect(getAgentSystemPrompt("assistant_only", null)).toContain("Routing hint for this turn: assistant_only")
  })

  it("is structured with section headers", () => {
    const prompt = getAgentSystemPrompt("youtube", null)
    expect(prompt).toContain("# Identity and Scope")
    expect(prompt).toContain("# Tool Usage")
    expect(prompt).toContain("# General Behavior")
    expect(prompt).toContain("# Video and Recipe Workflow")
    expect(prompt).toContain("# Video Selection Rules")
    expect(prompt).toContain("# Ingredient Handling")
    expect(prompt).toContain("# Cart Mutation Rules")
    expect(prompt).toContain("# Response Style")
  })

  it("contains video selection rules", () => {
    const prompt = getAgentSystemPrompt("youtube", null)
    expect(prompt).toContain("Prefer a single, well-explained recipe video")
    expect(prompt).toContain("try up to five likely candidates")
    expect(prompt).toContain("do not answer from search results alone")
  })

  it("contains ingredient handling rules", () => {
    const prompt = getAgentSystemPrompt("kroger", null)
    expect(prompt).toContain("pantry staples")
    expect(prompt).toContain("ingredientQuantity")
    expect(prompt).toContain("ingredientUnit")
  })
})
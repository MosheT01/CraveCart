import { describe, expect, it } from "vitest"
import { hasExplicitBuyIntent, isCartStatusFollowup, isVideoContextFollowup, shouldUseCarryoverContext, suggestToolDomains } from "@/lib/agent/intent"

describe("agent intent guard", () => {
  it("allows cart mutation only on explicit buy intent", () => {
    expect(hasExplicitBuyIntent("buy milk")).toBe(true)
    expect(hasExplicitBuyIntent("use a cooking video to buy me groceries")).toBe(true)
    expect(hasExplicitBuyIntent("tell me about this burger video")).toBe(false)
  })

  it("suggests the correct tool domains", () => {
    expect(suggestToolDomains("tell me about this cheeseburger video")).toBe("youtube")
    expect(suggestToolDomains("buy milk")).toBe("kroger")
    expect(suggestToolDomains("find a good chicken alfredo video and buy the groceries")).toBe("hybrid")
  })

  it("detects follow-up turns that should reuse prior recipe context", () => {
    expect(shouldUseCarryoverContext("buy them for me")).toBe(true)
    expect(shouldUseCarryoverContext("did you buy all the ingredients")).toBe(true)
    expect(shouldUseCarryoverContext("what does the transcript say")).toBe(true)
    expect(shouldUseCarryoverContext("transcript?")).toBe(true)
    expect(shouldUseCarryoverContext("tell me about a new pizza video")).toBe(false)
  })

  it("detects cart status follow-ups", () => {
    expect(isCartStatusFollowup("did you buy all the ingredients")).toBe(true)
    expect(isCartStatusFollowup("what's the cart status")).toBe(true)
    expect(isCartStatusFollowup("buy them for me")).toBe(false)
  })

  it("detects video context follow-ups that should reuse saved context", () => {
    expect(isVideoContextFollowup("how did he make it")).toBe(true)
    expect(isVideoContextFollowup("what ingredients were in it")).toBe(true)
    expect(isVideoContextFollowup("what does the transcript say")).toBe(true)
    expect(isVideoContextFollowup("transcript?")).toBe(true)
    expect(isVideoContextFollowup("search for another taco video")).toBe(false)
  })
})

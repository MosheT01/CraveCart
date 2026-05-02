import { describe, expect, it } from "vitest"
import { detectUnsupportedCartOperation, hasExplicitBuyIntent, isCartStatusFollowup, isVideoContextFollowup, shouldUseCarryoverContext, suggestToolDomains } from "@/lib/agent/intent"

describe("agent intent guard", () => {
  it("allows cart mutation only on explicit buy intent", () => {
    expect(hasExplicitBuyIntent("buy milk")).toBe(true)
    expect(hasExplicitBuyIntent("use a cooking video to buy me groceries")).toBe(true)
    expect(hasExplicitBuyIntent("tell me about this burger video")).toBe(false)
  })

  it("detects various buy intent patterns", () => {
    expect(hasExplicitBuyIntent("order groceries")).toBe(true)
    expect(hasExplicitBuyIntent("purchase ingredients")).toBe(true)
    expect(hasExplicitBuyIntent("shop for dinner")).toBe(true)
    expect(hasExplicitBuyIntent("add to cart")).toBe(true)
    expect(hasExplicitBuyIntent("put these in my cart")).toBe(true)
    expect(hasExplicitBuyIntent("get groceries")).toBe(true)
    expect(hasExplicitBuyIntent("grab some eggs")).toBe(true)
  })

  it("rejects non-buy intent messages", () => {
    expect(hasExplicitBuyIntent("what's in the video")).toBe(false)
    expect(hasExplicitBuyIntent("tell me the recipe")).toBe(false)
    expect(hasExplicitBuyIntent("show me cooking videos")).toBe(false)
    expect(hasExplicitBuyIntent("how do I make pasta")).toBe(false)
  })

  it("suggests the correct tool domains", () => {
    expect(suggestToolDomains("tell me about this cheeseburger video")).toBe("youtube")
    expect(suggestToolDomains("buy milk")).toBe("kroger")
    expect(suggestToolDomains("find a good chicken alfredo video and buy the groceries")).toBe("hybrid")
  })

  it("detects follow-up turns that should reuse prior recipe context", () => {
    expect(shouldUseCarryoverContext("buy them for me")).toBe(true)
    expect(shouldUseCarryoverContext("did you buy all the ingredients")).toBe(true)
    expect(shouldUseCarryoverContext("tell me about a new pizza video")).toBe(false)
  })

  it("detects various carryover patterns", () => {
    expect(shouldUseCarryoverContext("add the rest")).toBe(true)
    expect(shouldUseCarryoverContext("buy the rest")).toBe(true)
    expect(shouldUseCarryoverContext("finish the cart")).toBe(true)
    expect(shouldUseCarryoverContext("continue shopping")).toBe(true)
    expect(shouldUseCarryoverContext("the remaining ingredients")).toBe(true)
    expect(shouldUseCarryoverContext("these ingredients")).toBe(true)
    expect(shouldUseCarryoverContext("how did he make it")).toBe(true)
    expect(shouldUseCarryoverContext("what's in it")).toBe(true)
  })

  it("detects cart status follow-ups", () => {
    expect(isCartStatusFollowup("did you buy all the ingredients")).toBe(true)
    expect(isCartStatusFollowup("what's the cart status")).toBe(true)
    expect(isCartStatusFollowup("buy them for me")).toBe(false)
  })

  it("detects video context follow-ups that should reuse saved context", () => {
    expect(isVideoContextFollowup("how did he make it")).toBe(true)
    expect(isVideoContextFollowup("what ingredients were in it")).toBe(true)
    expect(isVideoContextFollowup("search for another taco video")).toBe(false)
  })

  it("detects unsupported cart operations", () => {
    expect(detectUnsupportedCartOperation("clear my cart")).toBe("clear_cart")
    expect(detectUnsupportedCartOperation("empty the cart")).toBe("clear_cart")
    expect(detectUnsupportedCartOperation("remove item from cart")).toBe("remove_item")
    expect(detectUnsupportedCartOperation("delete from cart")).toBe("remove_item")
    expect(detectUnsupportedCartOperation("change quantity in cart")).toBe("update_quantity")
    expect(detectUnsupportedCartOperation("increase amount in cart")).toBe("update_quantity")
    expect(detectUnsupportedCartOperation("buy groceries")).toBe(null)
    expect(detectUnsupportedCartOperation("find a recipe")).toBe(null)
  })
})

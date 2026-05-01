import { describe, expect, it } from "vitest"
import { detectUnsupportedCartOperation } from "@/lib/agent/intent"

describe("detectUnsupportedCartOperation", () => {
  it("detects cart clear requests", () => {
    expect(detectUnsupportedCartOperation("please delete everything in my cart")).toBe("clear_cart")
  })

  it("detects cart item removal requests", () => {
    expect(detectUnsupportedCartOperation("remove the milk from my cart")).toBe("remove_item")
  })

  it("detects cart quantity change requests", () => {
    expect(detectUnsupportedCartOperation("change the quantity of eggs in my cart to 2")).toBe("update_quantity")
  })

  it("does not flag add-to-cart requests", () => {
    expect(detectUnsupportedCartOperation("buy milk and add it to my cart")).toBeNull()
  })
})

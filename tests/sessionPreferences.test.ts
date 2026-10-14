import { describe, expect, it } from "vitest"
import {
  getUpdatedPreferencesFromResponse,
  parseUserPreferences,
} from "@/lib/agent/sessionState"

describe("session preference parsing", () => {
  it("does not treat ordinary recipe words as allergies", () => {
    expect(parseUserPreferences("I'm craving an American cheeseburger")).toBeNull()
  })

  it("recognizes an explicit allergy statement", () => {
    expect(parseUserPreferences("I am allergic to peanuts")).toMatchObject({
      allergies: ["peanuts"],
    })
  })

  it("clears previous preferences when the user says there are no restrictions", () => {
    const result = getUpdatedPreferencesFromResponse("no restrictions", {
      allergies: ["cheese"],
      dietary: ["keto"],
      avoidedIngredients: [],
      other: [],
    })

    expect(result).toMatchObject({
      allergies: [],
      dietary: [],
      avoidedIngredients: [],
      other: [],
    })
  })
})

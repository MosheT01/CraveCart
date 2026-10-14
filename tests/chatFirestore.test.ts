import { describe, expect, it } from "vitest"
import { stripUndefined } from "@/lib/server/chatFirestore"

describe("stripUndefined", () => {
  it("removes undefined values recursively before Firestore writes", () => {
    expect(
      stripUndefined({
        latestCart: {
          video: undefined,
          items: [{ ingredient: "milk", imageUrl: undefined }],
        },
        keep: null,
      }),
    ).toEqual({
      latestCart: {
        items: [{ ingredient: "milk" }],
      },
      keep: null,
    })
  })
})

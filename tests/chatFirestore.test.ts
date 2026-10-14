import { describe, expect, it } from "vitest"
import { compactForFirestore, stripUndefined } from "@/lib/server/chatFirestore"

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

describe("compactForFirestore", () => {
  it("keeps chat documents below the Firestore size limit", () => {
    const huge = "x".repeat(1_100_000)
    const compacted = compactForFirestore({
      sessions: [{ id: "session-1", title: "Huge", createdAt: 1 }],
      messagesBySession: {
        "session-1": [{ id: "message-1", role: "assistant", content: huge, video: null, cart: null, traces: [{ output: huge }] }],
      },
      agentStateBySession: {},
    })

    expect(Buffer.byteLength(JSON.stringify(compacted), "utf8")).toBeLessThan(900_000)
    expect(compacted.messagesBySession["session-1"][0].traces[0].output).toBeUndefined()
  })
})

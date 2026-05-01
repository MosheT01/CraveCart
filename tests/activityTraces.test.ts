import { describe, expect, it } from "vitest"
import { collapseToolTraces } from "@/lib/agent/activity"

describe("collapseToolTraces", () => {
  it("keeps only the latest state for each tool call id", () => {
    const traces = collapseToolTraces([
      {
        id: "a",
        name: "search_youtube_videos",
        status: "started",
        summary: "Calling search_youtube_videos.",
        arguments: {},
      },
      {
        id: "a",
        name: "search_youtube_videos",
        status: "finished",
        summary: "Found 1 YouTube candidate.",
        arguments: {},
      },
      {
        id: "b",
        name: "get_video_context",
        status: "started",
        summary: "Calling get_video_context.",
        arguments: {},
      },
    ])

    expect(traces).toHaveLength(2)
    expect(traces[0]?.id).toBe("a")
    expect(traces[0]?.status).toBe("finished")
    expect(traces[1]?.id).toBe("b")
    expect(traces[1]?.status).toBe("started")
  })
})

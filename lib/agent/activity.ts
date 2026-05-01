import type { ToolTraceEntry } from "@/lib/types"

export function collapseToolTraces(traces: ToolTraceEntry[]) {
  const latestById = new Map<string, ToolTraceEntry>()
  const order: string[] = []

  for (const trace of traces) {
    if (!latestById.has(trace.id)) {
      order.push(trace.id)
    }
    latestById.set(trace.id, trace)
  }

  return order
    .map((id) => latestById.get(id))
    .filter((trace): trace is ToolTraceEntry => Boolean(trace))
}

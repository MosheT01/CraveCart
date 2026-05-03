/**
 * Frontend-only stub for agent activity utilities.
 * Backend will handle actual agent tracing.
 */

import type { ToolTraceEntry } from "@/lib/types"

/**
 * Collapse tool traces to show only the latest state for each tool call.
 * This removes duplicate "started" entries when "finished" exists.
 */
export function collapseToolTraces(traces: ToolTraceEntry[]): ToolTraceEntry[] {
  const byId = new Map<string, ToolTraceEntry>()

  for (const trace of traces) {
    const existing = byId.get(trace.id)
    // Keep "finished" over "started" for the same ID
    if (!existing || trace.status === "finished") {
      byId.set(trace.id, trace)
    }
  }

  return Array.from(byId.values())
}

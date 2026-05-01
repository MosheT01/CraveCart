import { CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { collapseToolTraces } from "@/lib/agent/activity"
import type { ToolTraceEntry } from "@/lib/types"

interface AgentActivityPanelProps {
  traces: ToolTraceEntry[]
  isStreaming?: boolean
}

export function AgentActivityPanel({ traces, isStreaming = false }: AgentActivityPanelProps) {
  if (traces.length === 0 && !isStreaming) {
    return null
  }

  const displayTraces = collapseToolTraces(traces)

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/46">
        {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Sparkles className="h-3.5 w-3.5 text-primary/90" />}
        {isStreaming ? "Live Progress" : "What Happened"}
      </div>
      <div className="mt-3 space-y-2.5">
        {displayTraces.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/18 px-3.5 py-3 text-sm text-white/62">
            Planning the next tool call...
          </div>
        ) : null}
        {displayTraces.map((trace) => (
          <div key={`${trace.id}-${trace.status}`} className="rounded-2xl border border-white/8 bg-black/18 px-3.5 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              {trace.status === "started" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
              <span>{humanizeToolName(trace.name)}</span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-white/62">{trace.summary}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function humanizeToolName(name: string) {
  return name
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
    .replace(/^Add Kroger Items To Cart$/, "Add Items To Cart")
    .replace(/^Get Kroger Auth Status$/, "Check Kroger Auth")
    .replace(/^Search Kroger Products$/, "Search Kroger")
    .replace(/^Search Youtube Videos$/, "Search YouTube")
    .replace(/^Get Video Context$/, "Fetch Video Context")
    .replace(/^Get Fallback Recipe$/, "Load Fallback Recipe")
    .replace(/^Get Kroger Cart Summary$/, "Read Cart Summary")
}

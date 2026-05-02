"use client"

import { useEffect, useState } from "react"
import { Loader2, LogOut, ShoppingBag } from "lucide-react"
import { clearKrogerConnectRedirectPending, startKrogerConnect } from "@/lib/kroger/clientStartConnect"
import { cn } from "@/lib/utils"

type ConnectStatus = "idle" | "loading" | "connected" | "mock"

interface KrogerConnectButtonProps {
  isConnected: boolean
  isMock: boolean
  /** Gentle motion + glow — use when user dismissed the Kroger prompt but hasn’t linked yet */
  attentionNudge?: boolean
  onConnected: () => void
  onDisconnected: () => Promise<void>
}

export function KrogerConnectButton({
  isConnected,
  isMock,
  attentionNudge = false,
  onConnected,
  onDisconnected,
}: KrogerConnectButtonProps) {
  const [status, setStatus] = useState<ConnectStatus>(() =>
    !isConnected ? "idle" : isMock ? "mock" : "connected",
  )
  const [disconnecting, setDisconnecting] = useState(false)
  const [connectHint, setConnectHint] = useState<string | null>(null)

  useEffect(() => {
    setStatus(!isConnected ? "idle" : isMock ? "mock" : "connected")
  }, [isConnected, isMock])

  async function handleConnect() {
    if (status !== "idle") return
    setStatus("loading")
    setConnectHint("Preparing secure Kroger handoff...")

    try {
      const result = await startKrogerConnect()

      if (result.kind === "mock") {
        setStatus("mock")
        onConnected()
        return
      }

      if (result.kind === "redirect") {
        return
      }

      setStatus("idle")
      setConnectHint("Could not start connect flow.")
    } catch {
      setStatus("idle")
      setConnectHint("Network issue while connecting.")
    }
  }

  async function handleDisconnect() {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      await onDisconnected()
      setStatus("idle")
      localStorage.removeItem("cravecart_kroger_connected")
      localStorage.removeItem("cravecart_kroger_mock")
      clearKrogerConnectRedirectPending()
    } finally {
      setDisconnecting(false)
    }
  }

  const connected = status === "connected" || status === "mock"

  if (connected) {
    return (
      <div className="flex max-w-[min(100%,380px)] items-center gap-2 sm:gap-3">
        <div
          role="status"
          aria-label={status === "mock" ? "Kroger mock mode active" : "Kroger connected"}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1.5 text-sm text-green-300",
            "shadow-[0_0_18px_rgba(34,197,94,0.14)] transition-shadow duration-1000",
          )}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="hidden truncate sm:inline text-[13px] font-medium">
            {status === "mock" ? "Kroger (mock)" : "Kroger connected"}
          </span>
        </div>
        <button
          type="button"
          disabled={disconnecting}
          onClick={() => void handleDisconnect()}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border border-white/14 bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-white/75",
            "hover:border-white/25 hover:bg-white/10 hover:text-white",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/50",
            "disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          {disconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <LogOut className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleConnect}
        disabled={status === "loading"}
        aria-label="Connect your Kroger account"
        className={cn(
          "group flex items-center gap-2 rounded-full border border-amber-400/22 bg-amber-400/8 px-3 py-1.5 text-[13px] font-medium text-amber-200/90",
          "transition-all duration-200",
          "hover:border-amber-400/40 hover:bg-amber-400/14 hover:text-amber-100 hover:shadow-[0_0_16px_rgba(251,191,36,0.12)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          attentionNudge && status === "idle" && "relative z-[1] border-amber-400/55 ring-2 ring-amber-400/30 kroger-connect-nudge motion-reduce:animate-none motion-reduce:ring-amber-400/20",
        )}
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <ShoppingBag className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{status === "loading" ? "Connecting…" : "Connect Kroger"}</span>
      </button>
      {status === "loading" && connectHint ? <p className="text-[10px] text-white/35">{connectHint}</p> : null}
    </div>
  )
}

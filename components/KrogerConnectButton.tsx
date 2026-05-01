"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"

type ConnectStatus = "idle" | "loading" | "connected" | "mock"

interface KrogerConnectButtonProps {
  isConnected: boolean
  isMock: boolean
  onConnected: () => void
}

export function KrogerConnectButton({ isConnected, isMock, onConnected }: KrogerConnectButtonProps) {
  const [status, setStatus] = useState<ConnectStatus>(() => {
    if (!isConnected) return "idle"
    return isMock ? "mock" : "connected"
  })

  async function handleConnect() {
    if (status !== "idle") return
    setStatus("loading")

    try {
      const res = await fetch("/api/kroger/auth/start", { method: "POST" })
      const data = (await res.json()) as { mockMode?: boolean; authUrl?: string }

      if (data.mockMode) {
        setStatus("mock")
        localStorage.setItem("cravecart_kroger_connected", "1")
        localStorage.setItem("cravecart_kroger_mock", "1")
        onConnected()
        return
      }

      if (data.authUrl) {
        localStorage.setItem("cravecart_kroger_pending", "1")
        window.location.assign(data.authUrl)
        return
      }

      setStatus("idle")
    } catch {
      setStatus("idle")
    }
  }

  const connected = status === "connected" || status === "mock"

  if (connected) {
    return (
      <div
        role="status"
        aria-label={status === "mock" ? "Kroger mock mode active" : "Kroger connected"}
        className={cn(
          "flex items-center gap-2 rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1.5 text-sm text-green-300",
          "shadow-[0_0_18px_rgba(34,197,94,0.14)] transition-shadow duration-1000"
        )}
      >
        {/* Ping dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        <span className="hidden sm:inline text-[13px] font-medium">
          {status === "mock" ? "Kroger (mock)" : "Kroger connected"}
        </span>
      </div>
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={status === "loading"}
      aria-label="Connect your Kroger account"
      className={cn(
        "group flex items-center gap-2 rounded-full border border-amber-400/22 bg-amber-400/8 px-3 py-1.5 text-[13px] font-medium text-amber-200/90",
        "transition-all duration-200",
        "hover:border-amber-400/40 hover:bg-amber-400/14 hover:text-amber-100 hover:shadow-[0_0_16px_rgba(251,191,36,0.12)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400/50",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      {status === "loading" ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <ShoppingBag className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">
        {status === "loading" ? "Connecting…" : "Connect Kroger"}
      </span>
    </button>
  )
}

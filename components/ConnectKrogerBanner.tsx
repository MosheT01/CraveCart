"use client"

import { useSyncExternalStore, useState } from "react"
import { Loader2, MapPin, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  KROGER_CONNECT_PENDING_STORAGE_KEY,
  KROGER_PENDING_HANDOFF_EVENT,
  startKrogerConnect,
} from "@/lib/kroger/clientStartConnect"
import { cn } from "@/lib/utils"

function subscribePendingHandoff(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  const fire = () => onStoreChange()
  window.addEventListener(KROGER_PENDING_HANDOFF_EVENT, fire)
  window.addEventListener("focus", fire)
  window.addEventListener("pageshow", fire)
  return () => {
    window.removeEventListener(KROGER_PENDING_HANDOFF_EVENT, fire)
    window.removeEventListener("focus", fire)
    window.removeEventListener("pageshow", fire)
  }
}

function getPendingHandoffSnapshot() {
  if (typeof window === "undefined") return false
  return localStorage.getItem(KROGER_CONNECT_PENDING_STORAGE_KEY) === "1"
}

interface ConnectKrogerBannerProps {
  onConnected: () => void
}

export function ConnectKrogerBanner({ onConnected }: ConnectKrogerBannerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasPendingHandoff = useSyncExternalStore(subscribePendingHandoff, getPendingHandoffSnapshot, () => false)

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const result = await startKrogerConnect()
      if (result.kind === "mock") {
        onConnected()
        return
      }
      if (result.kind === "redirect") {
        return
      }
      if (result.kind === "unauthorized") {
        setError("Sign in again from the home page, then connect Kroger.")
        return
      }
      setError(result.message ?? "Could not start Kroger connection.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Connect Kroger to enable chat"
      className={cn(
        "relative shrink-0 overflow-hidden border-b border-amber-400/20",
        "bg-gradient-to-r from-amber-400/[0.09] via-amber-400/[0.06] to-transparent",
        "px-4 py-3.5 backdrop-blur-md sm:px-6",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10">
            <ShoppingBag className="h-4 w-4 text-amber-200/90" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-[14px] font-semibold leading-snug text-amber-100/95">
              Connect Kroger to start chatting
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-relaxed text-amber-200/65">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-300/70" aria-hidden />
                Real US grocery inventory, pickup & delivery — checkout stays on Kroger.
              </span>
              <span className="text-amber-200/45">OAuth keeps your password off our servers.</span>
            </p>
            {hasPendingHandoff ? (
              <p className="text-[12px] text-emerald-200/85">
                Handoff in progress detected. If you just finished Kroger sign-in, press connect to resume.
              </p>
            ) : null}
            {error ? <p className="text-[12px] text-rose-300/95">{error}</p> : null}
          </div>
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void handleConnect()}
          className={cn(
            "h-10 shrink-0 rounded-full bg-gradient-to-r from-amber-400/95 to-amber-500/90 px-6 text-[13px] font-semibold text-amber-950 shadow-lg shadow-amber-500/15",
            "hover:brightness-110 disabled:opacity-50",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              {hasPendingHandoff ? "Resume Kroger connect" : "Connect Kroger"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

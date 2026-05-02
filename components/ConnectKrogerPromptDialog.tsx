"use client"

import { useState } from "react"
import { Loader2, ShoppingBag, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { startKrogerConnect } from "@/lib/kroger/clientStartConnect"
import {
  clearKrogerConnectPromptDismissed,
  setKrogerConnectPromptDismissed,
} from "@/lib/kroger/connectPromptSession"

interface ConnectKrogerPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Bump parent UI (e.g. nudge Kroger chip) once dismiss is persisted */
  afterDismissPersist: () => void
}

export function ConnectKrogerPromptDialog({
  open,
  onOpenChange,
  afterDismissPersist,
}: ConnectKrogerPromptDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function userDismissed() {
    if (typeof window !== "undefined") {
      setKrogerConnectPromptDismissed(sessionStorage)
    }
    afterDismissPersist()
    onOpenChange(false)
  }

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const result = await startKrogerConnect()
      if (result.kind === "redirect") {
        if (typeof window !== "undefined") {
          clearKrogerConnectPromptDismissed(sessionStorage)
        }
        return
      }
      if (result.kind === "unauthorized") {
        setError("Stay signed into CraveCart, then try again.")
        return
      }
      setError(result.message ?? "Could not start Kroger.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        overlayClassName="z-[115] bg-black/75 backdrop-blur-md"
        onInteractOutside={(e) => {
          e.preventDefault()
          userDismissed()
        }}
        onEscapeKeyDown={() => userDismissed()}
        className="z-[120] max-w-md border-white/12 bg-[oklch(0.13_0.02_248/0.98)] backdrop-blur-xl shadow-2xl"
      >
        <DialogPrimitive.Close
          type="button"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/45 opacity-90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:pointer-events-none"
          aria-label="Close"
          onClick={(e) => {
            e.preventDefault()
            userDismissed()
          }}
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
        <DialogHeader className="space-y-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/28 bg-amber-400/10">
            <ShoppingBag className="h-5 w-5 text-amber-200/90" aria-hidden />
          </div>
          <DialogTitle className="text-xl text-white">
            Link your Kroger account
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-relaxed text-white/55">
            Sign in once with Kroger (OAuth — your password never touches CraveCart) so search, cart adds, and
            checkout reflect your real store. You can still chat without linking, but cart features need Kroger.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200/95">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full text-white/45 hover:bg-white/[0.06] hover:text-white/75"
            disabled={busy}
            onClick={userDismissed}
          >
            Not now — I&apos;ll chat without Kroger
          </Button>
          <Button
            type="button"
            variant="cinematic"
            disabled={busy}
            onClick={() => void handleConnect()}
            className="h-11 w-full rounded-full sm:h-12 sm:w-auto sm:min-w-[200px]"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Opening Kroger…
              </>
            ) : (
              <>
                <ShoppingBag className="h-5 w-5" />
                Connect Kroger
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface StartAuthState {
  mode: "loading" | "connected" | "error"
  message?: string
}

interface KrogerAuthClientProps {
  initialState: StartAuthState
}

export function KrogerAuthClient({ initialState }: KrogerAuthClientProps) {
  const [state, setState] = useState<StartAuthState>(initialState)

  useEffect(() => {
    if (state.mode === "connected") {
      localStorage.setItem("cravecart_kroger_connected", "1")
    }
  }, [state.mode])

  useEffect(() => {
    if (state.mode !== "loading") {
      return
    }

    let cancelled = false

    void fetch("/api/kroger/auth/start", {
      method: "POST",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          authUrl?: string
          message?: string
        }

        if (cancelled) {
          return
        }

        if (response.status === 401) {
          setState({
            mode: "error",
            message: "Sign in to CraveCart from the home page, then connect Kroger from there.",
          })
          return
        }

        if (!response.ok) {
          setState({
            mode: "error",
            message: payload.message ?? "Could not start Kroger OAuth.",
          })
          return
        }

        if (payload.authUrl) {
          window.location.assign(payload.authUrl)
          return
        }

        setState({
          mode: "error",
          message: "Kroger did not return an authorization URL.",
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setState({
          mode: "error",
          message: error instanceof Error ? error.message : "Could not start Kroger OAuth.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [state.mode])

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl rounded-[32px] border border-white/15 bg-black/40 p-8 text-white backdrop-blur-2xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to CraveCart
        </Link>

        {state.mode === "loading" ? (
          <div className="mt-8 space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <h1 className="text-3xl font-semibold">Connecting to Kroger</h1>
            <p className="text-sm text-white/70">Redirecting you to Kroger authorization.</p>
          </div>
        ) : null}

        {state.mode === "connected" ? (
          <div className="mt-8 space-y-4">
            <h1 className="text-3xl font-semibold">Kroger connected</h1>
            <p className="text-sm text-white/70">Return home and rerun the craving to push items into the live cart.</p>
            <Link href="/">
              <Button className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                Back to home
              </Button>
            </Link>
          </div>
        ) : null}

        {state.mode === "error" ? (
          <div className="mt-8 space-y-4">
            <h1 className="text-3xl font-semibold">Could not connect Kroger</h1>
            <p className="text-sm text-rose-200">{state.message}</p>
            <Link href="/">
              <Button variant="secondary" className="rounded-full px-6">
                Back to home
              </Button>
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  )
}

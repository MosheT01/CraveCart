"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2, ShoppingBag, Sparkles, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearKrogerConnectRedirectPending } from "@/lib/kroger/clientStartConnect"

interface StartAuthState {
  mode: "loading" | "connected" | "error"
  message?: string
}

interface KrogerAuthClientProps {
  initialState: StartAuthState
}

export function KrogerAuthClient({ initialState }: KrogerAuthClientProps) {
  const router = useRouter()
  const [state, setState] = useState<StartAuthState>(initialState)
  const [redirectSeconds, setRedirectSeconds] = useState(5)

  useEffect(() => {
    if (state.mode === "connected") {
      clearKrogerConnectRedirectPending()
      localStorage.setItem("cravecart_kroger_connected", "1")
    }
  }, [state.mode])

  useEffect(() => {
    if (state.mode !== "connected") return

    const interval = window.setInterval(() => {
      setRedirectSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)

    const redirect = window.setTimeout(() => {
      router.push("/")
    }, 5000)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(redirect)
    }
  }, [state.mode, router])

  useEffect(() => {
    if (state.mode !== "loading") {
      return
    }

    let cancelled = false

    void fetch("/api/kroger/auth/start", {
      method: "POST",
      credentials: "same-origin",
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
      <section className="w-full max-w-xl rounded-[32px] border border-white/12 bg-[oklch(0.12_0.02_248/0.92)] p-8 text-white shadow-2xl backdrop-blur-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CraveCart
        </Link>

        {state.mode === "loading" ? (
          <div className="mt-10 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <h1 className="text-3xl font-semibold tracking-tight">Connecting to Kroger</h1>
            <p className="max-w-md text-[15px] leading-relaxed text-white/55">
              Redirecting you to Kroger&apos;s secure sign-in. Your password never passes through CraveCart.
            </p>
            <p className="text-[12px] text-white/40">After Kroger login, you&apos;ll return here automatically and continue onboarding.</p>
          </div>
        ) : null}

        {state.mode === "connected" ? (
          <div className="mt-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" aria-hidden />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">You&apos;re linked</h1>
                <p className="mt-1 text-sm text-white/45">
                  Redirecting home in {redirectSeconds}s to resume chat…
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">What unlocks now</p>
              <ul className="mt-4 space-y-3 text-[14px] leading-snug text-white/65">
                <li className="flex gap-3">
                  <Youtube className="mt-0.5 h-5 w-5 shrink-0 text-primary/90" aria-hidden />
                  <span>Recipe runs pull ingredients from real videos with Gemini + YouTube tools.</span>
                </li>
                <li className="flex gap-3">
                  <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400/90" aria-hidden />
                  <span>Kroger search uses your shopper token — better matches near your store.</span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-300/90" aria-hidden />
                  <span>Ask for groceries in chat — we can add matched items to your live cart.</span>
                </li>
              </ul>
            </div>

            <Button asChild className="rounded-full bg-primary px-8 text-primary-foreground hover:bg-primary/90">
              <Link href="/">Back to home now</Link>
            </Button>
          </div>
        ) : null}

        {state.mode === "error" ? (
          <div className="mt-10 space-y-5">
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4">
              <h1 className="text-xl font-semibold text-rose-100">Couldn&apos;t connect Kroger</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-rose-200/85">{state.message}</p>
            </div>
            <p className="text-[13px] text-white/45">
              Tip: open CraveCart while signed in, then use <span className="text-white/65">Connect Kroger</span> from the header.
            </p>
            <Button asChild variant="secondary" className="rounded-full px-8">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

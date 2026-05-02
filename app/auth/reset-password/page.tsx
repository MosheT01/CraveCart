"use client"

import { Suspense, useState, type FormEvent } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { confirmPasswordReset, getAuth } from "firebase/auth"
import { Eye, EyeOff, ShoppingCart } from "lucide-react"
import { fetchFirebaseBrowserConfig, getFirebaseBrowserApp, mapFirebaseAuthError } from "@/lib/firebase/clientAuth"
import { cn } from "@/lib/utils"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const oobCode = searchParams.get("oobCode") ?? ""
  const modeParam = searchParams.get("mode") ?? ""
  const isFirebaseResetLink = Boolean(oobCode && modeParam === "resetPassword")

  const [pw, setPw] = useState("")
  const [pw2, setPw2] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!isFirebaseResetLink) {
      setError("Open the reset link from your email (this page needs a valid Firebase action link).")
      return
    }
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (pw !== pw2) {
      setError("Passwords don't match.")
      return
    }

    setBusy(true)
    try {
      const cfg = await fetchFirebaseBrowserConfig()
      if (!cfg.configured) {
        setError("Firebase is not enabled on this deployment.")
        return
      }
      try {
        const auth = getAuth(getFirebaseBrowserApp(cfg))
        await confirmPasswordReset(auth, oobCode, pw)
      } catch (err) {
        setError(mapFirebaseAuthError(err))
        return
      }
      setDone(true)
    } catch {
      setError("Network error.")
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-[14px] text-white placeholder:text-white/25 transition-all duration-200 focus:border-primary/45 focus:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/15"

  if (done) {
    return (
      <div className="w-full max-w-[420px] space-y-6 text-center">
        <div className="mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/8">
          <ShoppingCart className="h-[26px] w-[26px] text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-white">Password updated</h1>
        <p className="text-sm text-white/55">You can sign in with your new password.</p>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-primary to-[oklch(0.72_0.18_60)] py-3 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/20"
        >
          Back to CraveCart
        </Link>
      </div>
    )
  }

  if (!isFirebaseResetLink) {
    return (
      <div className="w-full max-w-[420px] space-y-6 text-center">
        <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/8">
          <ShoppingCart className="h-[26px] w-[26px] text-primary" />
        </div>
        <h1 className="text-[22px] font-semibold text-white">Reset link required</h1>
        <p className="text-sm leading-relaxed text-white/55">
          Request a password reset from the CraveCart sign-in screen. This page must be opened from the Firebase email
          link (includes <span className="font-mono text-[12px] text-white/45">oobCode</span> in the URL).
        </p>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-full border border-white/15 py-3 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/8"
        >
          Back to CraveCart
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[420px] space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/8">
          <ShoppingCart className="h-[26px] w-[26px] text-primary" />
        </div>
        <h1 className="text-[26px] font-semibold text-white">Set a new password</h1>
        <p className="mt-1.5 text-sm text-white/42">Secure link from your reset email.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-white/10 bg-[oklch(0.135_0.02_248/0.85)] p-7 shadow-2xl backdrop-blur-2xl">
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">New password</span>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={cn(inputCls, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => !p)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">Confirm</span>
          <input type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </label>

        {error ? <p className="text-[13px] text-rose-400">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.72_0.18_60)] py-3 text-[13px] font-semibold text-primary-foreground shadow-lg disabled:opacity-40"
        >
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="text-white/50">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}

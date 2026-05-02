"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth"
import { Eye, EyeOff, ShoppingCart } from "lucide-react"
import {
  fetchFirebaseBrowserConfig,
  getFirebaseBrowserApp,
  mapFirebaseAuthError,
  postFirebaseSessionCookie,
  type LoadedFirebaseBrowserConfig,
} from "@/lib/firebase/clientAuth"
import { cn } from "@/lib/utils"

type Tab = "signin" | "signup"

export interface AuthUserDto {
  id: string
  name: string
  email: string
}

interface LoginScreenProps {
  onAuthed?: (user: AuthUserDto) => void
}

type FirebaseGate = "loading" | "ready" | "misconfigured"

export function LoginScreen({ onAuthed }: LoginScreenProps) {
  const [visibleTab, setVisibleTab] = useState<Tab>("signin")
  const [showForgot, setShowForgot] = useState(false)
  const [fading, setFading] = useState(false)

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")

  const [fbGate, setFbGate] = useState<FirebaseGate>("loading")
  const [fbCfg, setFbCfg] = useState<LoadedFirebaseBrowserConfig | null>(null)

  useEffect(() => {
    void fetchFirebaseBrowserConfig().then((c) => {
      if (c.configured) {
        setFbCfg(c)
        setFbGate("ready")
      } else {
        setFbGate("misconfigured")
      }
    })
  }, [])

  /** Forgot password panel */
  const [fpEmail, setFpEmail] = useState("")
  const [fpDone, setFpDone] = useState(false)

  async function loadAuthedUserFromMe(): Promise<AuthUserDto | null> {
    const meRes = await fetch("/api/auth/me", { credentials: "same-origin" })
    const data = (await meRes.json()) as { user: AuthUserDto | null }
    return data.user ?? null
  }

  // Sign In fields
  const [siEmail, setSiEmail] = useState("")
  const [siPassword, setSiPassword] = useState("")
  const [siShowPw, setSiShowPw] = useState(false)

  // Sign Up fields
  const [suFirst, setSuFirst] = useState("")
  const [suLast, setSuLast] = useState("")
  const [suEmail, setSuEmail] = useState("")
  const [suPassword, setSuPassword] = useState("")
  const [suConfirm, setSuConfirm] = useState("")
  const [suShowPw, setSuShowPw] = useState(false)
  const [suShowConfirm, setSuShowConfirm] = useState(false)
  const [suFieldError, setSuFieldError] = useState("")

  function switchTab(next: Tab) {
    if (next === visibleTab || fading) return
    setFormError("")
    setFading(true)
    setTimeout(() => {
      setVisibleTab(next)
      setFading(false)
    }, 130)
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setFormError("")
    if (fbGate !== "ready" || !fbCfg) {
      setFormError("Firebase is not configured yet. See server logs / .env.example.")
      return
    }
    if (!siEmail.trim() || !siPassword) return
    setBusy(true)
    try {
      try {
        const auth = getAuth(getFirebaseBrowserApp(fbCfg))
        await signInWithEmailAndPassword(auth, siEmail.trim(), siPassword)
        const idToken = await auth.currentUser!.getIdToken(true)
        const sess = await postFirebaseSessionCookie(idToken)
        if (!sess.ok) {
          setFormError(sess.error)
          return
        }
        const user = await loadAuthedUserFromMe()
        if (user) {
          localStorage.removeItem("cravecart_user")
          onAuthed?.(user)
        }
      } catch (err) {
        setFormError(mapFirebaseAuthError(err))
      }
    } catch {
      setFormError("Network error. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setSuFieldError("")
    setFormError("")
    if (fbGate !== "ready" || !fbCfg) {
      setFormError("Firebase is not configured yet. See server logs / .env.example.")
      return
    }
    if (suPassword !== suConfirm) {
      setSuFieldError("Passwords don't match.")
      return
    }
    const name = [suFirst.trim(), suLast.trim()].filter(Boolean).join(" ")
    if (!name || !suEmail.trim()) return

    setBusy(true)
    try {
      try {
        const auth = getAuth(getFirebaseBrowserApp(fbCfg))
        const cred = await createUserWithEmailAndPassword(auth, suEmail.trim(), suPassword)
        await updateProfile(cred.user, { displayName: name })
        const idToken = await cred.user.getIdToken(true)
        const sess = await postFirebaseSessionCookie(idToken)
        if (!sess.ok) {
          setFormError(sess.error)
          return
        }
        const user = await loadAuthedUserFromMe()
        if (user) {
          localStorage.removeItem("cravecart_user")
          onAuthed?.(user)
        }
      } catch (err) {
        setFormError(mapFirebaseAuthError(err))
      }
    } catch {
      setFormError("Network error. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setFormError("")
    if (fbGate !== "ready" || !fbCfg) {
      setFormError("Firebase is not configured yet.")
      return
    }
    if (!fpEmail.trim()) return
    setBusy(true)
    setFpDone(false)
    try {
      try {
        const auth = getAuth(getFirebaseBrowserApp(fbCfg))
        const origin =
          typeof window !== "undefined" && window.location?.origin?.trim?.() ? window.location.origin : ""
        if (origin) {
          await sendPasswordResetEmail(auth, fpEmail.trim(), {
            url: `${origin}/auth/reset-password`,
            handleCodeInApp: false,
          })
        } else {
          await sendPasswordResetEmail(auth, fpEmail.trim())
        }
      } catch (err) {
        setFormError(mapFirebaseAuthError(err))
        return
      }
      setFpDone(true)
    } catch {
      setFormError("Network error. Try again.")
    } finally {
      setBusy(false)
    }
  }

  function openForgot() {
    setShowForgot(true)
    setFpEmail(siEmail.trim())
    setFpDone(false)
    setFormError("")
  }

  if (fbGate === "loading") {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <p className="text-sm text-white/45">Loading sign-in…</p>
      </main>
    )
  }

  if (fbGate === "misconfigured") {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold text-white">Firebase required</h1>
          <p className="text-sm leading-relaxed text-white/55">
            Set <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px]">FIREBASE_SERVICE_ACCOUNT_PATH</code> (or{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px]">FIREBASE_SERVICE_ACCOUNT_JSON</code>) and{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px]">FIREBASE_WEB_API_KEY</code> on the server,
            enable Email/Password auth and Firestore in the Firebase console, then restart.
          </p>
        </div>
      </main>
    )
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-[14px] text-white placeholder:text-white/25 transition-all duration-200 focus:border-primary/45 focus:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/15"

  if (showForgot) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] space-y-7">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4 inline-flex">
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
              <div className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/12 to-transparent shadow-xl shadow-primary/10">
                <ShoppingCart className="h-[26px] w-[26px] text-primary" />
              </div>
            </div>
            <h1 className="text-[26px] font-semibold tracking-tight text-white">Reset password</h1>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/42">
              {fpDone ? "Check your email for a reset link from Firebase." : "We’ll email reset instructions."}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[oklch(0.135_0.02_248/0.85)] shadow-2xl shadow-black/50 backdrop-blur-2xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="px-7 py-6">
              {fpDone ? (
                <div className="space-y-4">
                  <p className="text-[14px] leading-relaxed text-white/65">
                    If an account exists for that address, Firebase sent a reset link.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgot(false)
                      setFpDone(false)
                    }}
                    className="mt-2 w-full rounded-full border border-white/10 py-3 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/6"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} noValidate className="space-y-4">
                  <Field label="Email" htmlFor="fp-email">
                    <input
                      id="fp-email"
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoFocus
                      required
                      className={inputCls}
                    />
                  </Field>
                  {formError ? <p className="text-[13px] text-rose-400">{formError}</p> : null}
                  <SubmitButton disabled={!fpEmail.trim() || busy}>{busy ? "Sending…" : "Send reset link"}</SubmitButton>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setShowForgot(false)
                      setFormError("")
                    }}
                    className="w-full text-center text-[12px] text-white/35 transition-colors hover:text-white/55"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px] space-y-7">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 inline-flex">
            <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
            <div className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/12 to-transparent shadow-xl shadow-primary/10">
              <ShoppingCart className="h-[26px] w-[26px] text-primary" />
            </div>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">CraveCart</h1>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/42">AI-powered food planning and grocery shopping</p>
        </div>

        {/* Auth card */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[oklch(0.135_0.02_248/0.85)] shadow-2xl shadow-black/50 backdrop-blur-2xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          {/* Tab bar */}
          <div className="relative flex border-b border-white/8">
            {(["signin", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                disabled={busy}
                className={cn(
                  "relative flex-1 py-4 text-[13px] font-medium tracking-wide transition-colors duration-200 focus-visible:outline-none disabled:opacity-40",
                  visibleTab === t ? "text-white" : "text-white/35 hover:text-white/60",
                )}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
                <span
                  className={cn(
                    "absolute bottom-0 left-6 right-6 h-[2px] rounded-full bg-primary transition-all duration-300",
                    visibleTab === t ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0",
                  )}
                  style={{ transformOrigin: "center" }}
                />
              </button>
            ))}
          </div>

          {/* Form area — fades between tabs */}
          <div
            className={cn(
              "px-7 py-6 transition-[opacity,transform] duration-[130ms]",
              fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
            )}
          >
            {visibleTab === "signin" ? (
              <form onSubmit={handleSignIn} noValidate className="space-y-4">
                <Field label="Email" htmlFor="si-email">
                  <input
                    id="si-email"
                    type="email"
                    value={siEmail}
                    onChange={(e) => setSiEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    required
                    className={inputCls}
                  />
                </Field>

                <Field label="Password" htmlFor="si-password">
                  <PasswordInput
                    id="si-password"
                    value={siPassword}
                    onChange={(v) => setSiPassword(v)}
                    show={siShowPw}
                    onToggle={() => setSiShowPw((p) => !p)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={inputCls}
                  />
                </Field>

                <div className="-mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={openForgot}
                    className="text-[12px] text-primary/65 transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>

                {formError ? <p className="text-[13px] text-rose-400">{formError}</p> : null}
                <SubmitButton disabled={!siEmail.trim() || !siPassword || busy}>{busy ? "Signing in…" : "Sign In"}</SubmitButton>

                <p className="text-center text-[12px] text-white/30">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => switchTab("signup")}
                    className="text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline disabled:opacity-40"
                  >
                    Sign up
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSignUp} noValidate className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" htmlFor="su-first">
                    <input
                      id="su-first"
                      type="text"
                      value={suFirst}
                      onChange={(e) => setSuFirst(e.target.value)}
                      placeholder="Jane"
                      autoComplete="given-name"
                      autoFocus
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Last name" htmlFor="su-last">
                    <input
                      id="su-last"
                      type="text"
                      value={suLast}
                      onChange={(e) => setSuLast(e.target.value)}
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Email" htmlFor="su-email">
                  <input
                    id="su-email"
                    type="email"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className={inputCls}
                  />
                </Field>

                <Field label="Password" htmlFor="su-password">
                  <PasswordInput
                    id="su-password"
                    value={suPassword}
                    onChange={(v) => setSuPassword(v)}
                    show={suShowPw}
                    onToggle={() => setSuShowPw((p) => !p)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </Field>

                <Field label="Confirm password" htmlFor="su-confirm">
                  <PasswordInput
                    id="su-confirm"
                    value={suConfirm}
                    onChange={(v) => {
                      setSuConfirm(v)
                      setSuFieldError("")
                    }}
                    show={suShowConfirm}
                    onToggle={() => setSuShowConfirm((p) => !p)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn(inputCls, suFieldError ? "border-rose-500/50 focus:border-rose-500/60" : "")}
                  />
                  {suFieldError ? <p className="mt-1 text-[11px] text-rose-400">{suFieldError}</p> : null}
                </Field>

                {formError ? <p className="text-[13px] text-rose-400">{formError}</p> : null}
                <SubmitButton
                  disabled={
                    !suFirst.trim() || !suEmail.trim() || !suPassword || !suConfirm || suPassword.length < 8 || busy
                  }
                >
                  {busy ? "Creating account…" : "Create Account"}
                </SubmitButton>

                <p className="text-center text-[12px] text-white/30">
                  Already have an account?{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => switchTab("signin")}
                    className="text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline disabled:opacity-40"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-white/18">Powered by Gemini · YouTube · Kroger</p>
      </div>
    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[10px] uppercase tracking-[0.16em] text-white/35">
        {label}
      </label>
      {children}
    </div>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  autoComplete,
  className,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder: string
  autoComplete: string
  className: string
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(className, "pr-11")}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/55 focus-visible:outline-none"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        "mt-1 w-full rounded-full py-3 text-[13px] font-semibold tracking-wide",
        "bg-gradient-to-r from-primary to-[oklch(0.72_0.18_60)] text-primary-foreground",
        "shadow-lg shadow-primary/20 transition-all duration-200",
        "hover:shadow-primary/35 hover:brightness-110",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50",
        "disabled:cursor-not-allowed disabled:opacity-35",
      )}
    >
      {children}
    </button>
  )
}

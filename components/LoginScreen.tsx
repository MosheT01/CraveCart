"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth"
import { Eye, EyeOff, ShoppingCart } from "lucide-react"
import {
  fetchFirebaseBrowserConfig,
  FIREBASE_RESET_OUTLOOK_SAFELINKS_HINT,
  getFirebaseBrowserApp,
  mapFirebaseAuthError,
  postFirebaseSessionCookie,
  sendCravecartPasswordResetEmail,
  type LoadedFirebaseBrowserConfig,
} from "@/lib/firebase/clientAuth"
import { ONBOARDING_STEPS } from "@/lib/onboarding/narrative"
import { isReturningVisitor, markVisited } from "@/lib/onboarding/state"
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

  const [visitorKind] = useState<"fresh" | "returning">(() => {
    if (typeof window === "undefined") return "fresh"
    return isReturningVisitor(window.localStorage) ? "returning" : "fresh"
  })

  useEffect(() => {
    markVisited(window.localStorage)
  }, [])

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
        setFormError(mapFirebaseAuthError(err, "signIn"))
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
        setFormError(mapFirebaseAuthError(err, "signUp"))
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
          typeof window !== "undefined" && window.location?.origin?.trim?.() ? window.location.origin.trim() : ""
        await sendCravecartPasswordResetEmail(auth, fpEmail.trim(), origin)
      } catch (err) {
        setFormError(mapFirebaseAuthError(err, "passwordReset"))
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
      <main className="relative z-10 min-h-screen px-4 py-10 lg:flex lg:items-center lg:justify-center lg:py-12">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <BrandStoryPanel variant={visitorKind} />

          <div className="mx-auto w-full max-w-[440px] space-y-6 lg:mx-0 lg:justify-self-end">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <h1 className="text-[26px] font-semibold tracking-tight text-white">Reset password</h1>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/42">
              {fpDone ? "Check your email for a reset link from Firebase." : "We’ll email reset instructions."}
            </p>
          </div>

          <div className="surface-glass cinematic-divider relative overflow-hidden rounded-[28px]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="px-7 py-6">
              {fpDone ? (
                <div className="space-y-4">
                  <p className="text-[14px] leading-relaxed text-white/65">
                    If an account exists for that address, Firebase sent a reset link.
                  </p>
                  <p className="text-[11px] leading-relaxed text-white/42">{FIREBASE_RESET_OUTLOOK_SAFELINKS_HINT}</p>
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
        </div>
      </main>
    )
  }

  return (
    <main className="relative z-10 min-h-screen px-4 py-10 lg:flex lg:items-center lg:justify-center lg:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
        <BrandStoryPanel variant={visitorKind} />

        <div className="mx-auto w-full max-w-[440px] space-y-6 lg:mx-0 lg:justify-self-end">
        {/* Auth card */}
        <div className="surface-glass cinematic-divider relative overflow-hidden rounded-[28px]">
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

        <p className="text-center text-[11px] text-white/25 lg:text-left">Powered by Gemini · YouTube · Kroger · Secure OAuth handoff</p>
        </div>
      </div>
    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BrandStoryPanel({ variant }: { variant: "fresh" | "returning" }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX - rect.left) / rect.width - 0.5
    const dy = (event.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: dx * 6, y: dy * -5 })
  }

  function handleLeave() {
    setTilt({ x: 0, y: 0 })
  }

  return (
    <div className="relative order-1 flex flex-col justify-center lg:order-none">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
      </div>
      <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl animate-[cinematic-drift_8s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-10 right-0 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl animate-[cinematic-drift_10s_ease-in-out_infinite]" />

      <div className="relative space-y-6 text-center lg:text-left" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <div className="inline-flex flex-col items-center gap-4 lg:items-start">
          <div className="relative inline-flex">
            <div className="absolute inset-0 rounded-2xl bg-primary/35 blur-2xl animate-pulse" />
            <div className="relative flex h-[78px] w-[78px] items-center justify-center rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/30 via-primary/14 to-transparent shadow-2xl shadow-primary/15">
              <ShoppingCart className="h-[34px] w-[34px] text-primary animate-[food-float_6s_ease-in-out_infinite]" />
              <span className="absolute -right-2 -top-2 h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.7)] animate-[orbit-slow_4s_linear_infinite]" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary/75">Your AI grocery agent</p>
            {variant === "returning" ? (
              <>
                <h1 className="mt-3 text-balance text-[2rem] font-semibold leading-tight tracking-tight text-white md:text-[2.35rem]">
                  Welcome back
                </h1>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                  Sign in to continue planning meals and building your Kroger cart.
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-3 bg-gradient-to-r from-white via-white to-white/55 bg-clip-text text-balance text-[2rem] font-semibold leading-tight tracking-tight text-transparent md:text-[2.45rem]">
                  Crave it. Find it. Cart it.
                </h1>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/48">
                  A cinematic AI grocery flow: from craving to checkout in minutes, not hours.
                </p>
              </>
            )}
          </div>
        </div>

        <ul
          className="space-y-3 pt-2 transition-transform duration-300"
          style={{ transform: `perspective(950px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
        >
          {ONBOARDING_STEPS.map(({ icon: Icon, title, body, micro }, i) => (
            <li
              key={title}
              className="group relative flex gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] px-4 py-3.5 text-left backdrop-blur-sm transition-colors hover:border-white/12 animate-[card-pop-in_500ms_ease-out_both]"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="pointer-events-none absolute inset-y-0 -left-20 w-16 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[spotlight-sweep_1000ms_ease-out]" />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-white/35">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-primary/85" aria-hidden />
                  <span className="text-[14px] font-medium text-white/88">{title}</span>
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-white/45">{body}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/30">{micro}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-white/[0.06] pt-6">
          <p className="text-[12px] leading-relaxed text-white/38">
            <span className="font-medium text-white/55">Kroger</span> is a national supermarket chain with pickup and delivery — we connect so your cart matches real store inventory.
          </p>
          <p className="text-[11px] text-white/28">Your Kroger password never passes through CraveCart — OAuth keeps sign-in on Kroger&apos;s side.</p>
        </div>
      </div>
    </div>
  )
}

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

"use client"

import { useState, type FormEvent } from "react"
import { Eye, EyeOff, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = "signin" | "signup"

interface LoginScreenProps {
  onLogin: (name: string, email: string) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [visibleTab, setVisibleTab] = useState<Tab>("signin")
  const [fading, setFading] = useState(false)

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
  const [suError, setSuError] = useState("")

  function switchTab(next: Tab) {
    if (next === visibleTab || fading) return
    setFading(true)
    setTimeout(() => {
      setVisibleTab(next)
      setFading(false)
    }, 130)
  }

  function handleSignIn(e: FormEvent) {
    e.preventDefault()
    if (!siEmail.trim()) return
    const parts = siEmail.split("@")[0].split(/[._\-]/)
    const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
    onLogin(name, siEmail.trim())
  }

  function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setSuError("")
    if (suPassword !== suConfirm) {
      setSuError("Passwords don't match.")
      return
    }
    const name = [suFirst.trim(), suLast.trim()].filter(Boolean).join(" ")
    onLogin(name, suEmail.trim())
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-[14px] text-white placeholder:text-white/25 transition-all duration-200 focus:border-primary/45 focus:bg-white/8 focus:outline-none focus:ring-2 focus:ring-primary/15"

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
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-white/42">
            AI-powered food planning and grocery shopping
          </p>
        </div>

        {/* Auth card */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[oklch(0.135_0.02_248/0.85)] shadow-2xl shadow-black/50 backdrop-blur-2xl">
          {/* Top gradient accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          {/* Tab bar */}
          <div className="relative flex border-b border-white/8">
            {(["signin", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={cn(
                  "relative flex-1 py-4 text-[13px] font-medium tracking-wide transition-colors duration-200 focus-visible:outline-none",
                  visibleTab === t ? "text-white" : "text-white/35 hover:text-white/60"
                )}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
                <span
                  className={cn(
                    "absolute bottom-0 left-6 right-6 h-[2px] rounded-full bg-primary transition-all duration-300",
                    visibleTab === t ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
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
              fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
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

                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-[12px] text-primary/65 transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>

                <SubmitButton disabled={!siEmail.trim()}>Sign In</SubmitButton>

                <p className="text-center text-[12px] text-white/30">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchTab("signup")}
                    className="text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
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
                    onChange={(v) => { setSuConfirm(v); setSuError("") }}
                    show={suShowConfirm}
                    onToggle={() => setSuShowConfirm((p) => !p)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn(inputCls, suError ? "border-rose-500/50 focus:border-rose-500/60" : "")}
                  />
                  {suError && (
                    <p className="mt-1 text-[11px] text-rose-400">{suError}</p>
                  )}
                </Field>

                <SubmitButton disabled={!suFirst.trim() || !suEmail.trim() || !suPassword || !suConfirm}>
                  Create Account
                </SubmitButton>

                <p className="text-center text-[12px] text-white/30">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchTab("signin")}
                    className="text-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:underline"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-white/18">
          Powered by Gemini · YouTube · Kroger
        </p>
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
  id, value, onChange, show, onToggle, placeholder, autoComplete, className,
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
        "disabled:cursor-not-allowed disabled:opacity-35"
      )}
    >
      {children}
    </button>
  )
}

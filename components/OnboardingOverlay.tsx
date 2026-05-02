"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCartIcon,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { startKrogerConnect } from "@/lib/kroger/clientStartConnect"
import { ONBOARDING_STEPS } from "@/lib/onboarding/narrative"
import { markFirstVisitTourSeen } from "@/lib/onboarding/state"
import { cn } from "@/lib/utils"

const FEATURE_LINES = ["Diet-aware cravings", "Paste recipe links", "One-click Kroger cart"] as const
const DEMO_INGREDIENTS = [
  ["Chicken breast", "1.5 lb", "Kroger boneless chicken"],
  ["Heavy cream", "1 cup", "Private Selection heavy cream"],
  ["Parmesan", "4 oz", "Kroger grated parmesan"],
  ["Pasta", "16 oz", "Simple Truth linguine"],
] as const

const SCENES = ONBOARDING_STEPS.length

interface OnboardingOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when mock Kroger mode connects without redirect */
  onKrogerMockConnected: () => void
}

export function OnboardingOverlay({ open, onOpenChange, onKrogerMockConnected }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0)
  const [connectBusy, setConnectBusy] = useState(false)
  const [handoff, setHandoff] = useState(false)
  const [connectErr, setConnectErr] = useState<string | null>(null)

  function resetStep() {
    setStep(0)
    setConnectErr(null)
    setConnectBusy(false)
    setHandoff(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetStep()
    onOpenChange(next)
  }

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  function goToStep(target: number) {
    setStep(Math.max(0, Math.min(target, SCENES - 1)))
  }

  async function handleConnectKroger() {
    setConnectBusy(true)
    setHandoff(true)
    setConnectErr(null)
    try {
      const result = await startKrogerConnect()
      if (result.kind === "mock") {
        onKrogerMockConnected()
        handleOpenChange(false)
        return
      }
      if (result.kind === "redirect") {
        markFirstVisitTourSeen(window.localStorage)
        return
      }
      if (result.kind === "unauthorized") {
        setHandoff(false)
        setConnectErr("Sign in to CraveCart first, then try again.")
        return
      }
      setHandoff(false)
      setConnectErr(result.message ?? "Could not start Kroger connection.")
    } finally {
      setConnectBusy(false)
    }
  }

  function goNext() {
    goToStep(step + 1)
  }

  function goBack() {
    goToStep(step - 1)
  }

  const stepLabel = useMemo(() => `${step + 1} of ${SCENES}`, [step])
  const StepTwoIcon = ONBOARDING_STEPS[1].icon

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/85 backdrop-blur-xl" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden outline-none transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">CraveCart onboarding tour</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Three steps: welcome to CraveCart, learn about Kroger, connect your account or skip.
          </DialogPrimitive.Description>
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div className="absolute -left-1/4 top-0 h-[min(70vh,520px)] w-[min(90vw,720px)] rounded-full bg-primary/12 blur-[120px] animate-[cinematic-drift_8s_ease-in-out_infinite]" />
            <div className="absolute -right-1/4 bottom-0 h-[min(60vh,440px)] w-[min(85vw,640px)] rounded-full bg-emerald-500/10 blur-[100px] animate-[cinematic-drift_11s_ease-in-out_infinite]" />
            <div className="absolute -top-20 left-1/3 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl animate-[cinematic-drift_9s_ease-in-out_infinite]" />
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-auto">
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
              <div className="flex min-w-0 items-center gap-2">
                {Array.from({ length: SCENES }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToStep(i)}
                    className={cn(
                      "h-1.5 shrink-0 rounded-full transition-all duration-300",
                      i === step ? "w-8 bg-primary" : i < step ? "w-2 bg-white/35" : "w-2 bg-white/12",
                    )}
                    aria-label={`Jump to step ${i + 1}`}
                  />
                ))}
                <span className="ml-2 truncate text-[11px] uppercase tracking-[0.2em] text-white/40">{stepLabel}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="text-[13px] font-medium text-white/45 transition-colors hover:text-white/75"
                >
                  Skip tour
                </button>
                <DialogPrimitive.Close
                  className="rounded-lg p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <span className="sr-only">Close</span>
                  <span aria-hidden className="text-lg leading-none">
                    ×
                  </span>
                </DialogPrimitive.Close>
              </div>
            </header>

            {/* One step at a time — fills space between header and footer (no vertical tour scroll) */}
            <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 sm:px-8">
              <div
                key={step}
                className="reveal-up flex min-h-0 flex-1 flex-col items-center justify-center py-1"
                role="tabpanel"
                aria-live="polite"
              >
                {step === 0 ? (
                  <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
                    <div className="relative mb-3 inline-flex sm:mb-5">
                      <div className="absolute inset-0 rounded-[22px] bg-primary/25 blur-xl animate-pulse sm:rounded-[28px] sm:blur-2xl" />
                      <div className="relative flex h-[68px] w-[68px] items-center justify-center rounded-[22px] border border-primary/35 bg-gradient-to-br from-primary/35 via-primary/15 to-transparent shadow-xl shadow-primary/15 sm:h-[88px] sm:w-[88px] sm:rounded-[28px] sm:shadow-2xl">
                        <ShoppingCartIcon
                          className="h-9 w-9 text-primary animate-[food-float_5s_ease-in-out_infinite] sm:h-11 sm:w-11"
                          strokeWidth={1.25}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary/80 sm:text-[11px] sm:tracking-[0.35em]">
                      Step 1
                    </p>
                    <h2 className="mt-1.5 max-w-lg text-balance text-xl font-semibold leading-snug tracking-tight text-white sm:mt-2 sm:max-w-xl sm:text-3xl">
                      {ONBOARDING_STEPS[0].title}
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-snug text-white/50 sm:mt-3 sm:max-w-lg sm:text-[15px] sm:leading-relaxed">
                      {ONBOARDING_STEPS[0].body}
                    </p>
                    <div className="mt-3 flex max-w-lg flex-wrap justify-center gap-1.5 sm:mt-5 sm:gap-2">
                      {FEATURE_LINES.map((line) => (
                        <span
                          key={line}
                          className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55 sm:px-4 sm:py-2 sm:text-[12px]"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 w-full max-w-lg rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left surface-glass-soft sm:mt-4 sm:max-w-xl sm:rounded-2xl sm:p-4">
                      <p className="text-[10px] uppercase tracking-wider text-white/35 sm:text-xs">Micro Demo</p>
                      <div className="mt-2 space-y-1.5 text-[11px] sm:mt-3 sm:space-y-2 sm:text-[13px]">
                        <p className="rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-white/75 sm:rounded-2xl sm:px-3 sm:py-2">
                          I want a high-protein chicken pasta dinner
                        </p>
                        <p className="rounded-xl bg-primary/14 px-2.5 py-1.5 text-primary/90 sm:rounded-2xl sm:px-3 sm:py-2">
                          Got it. Parsing recipe intent and dietary goals…
                        </p>
                        <p className="rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-white/60 sm:rounded-2xl sm:px-3 sm:py-2">
                          {ONBOARDING_STEPS[0].micro}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="mx-auto w-full max-w-3xl text-center lg:text-left">
                    <div className="mb-2 inline-flex rounded-xl border border-white/10 bg-white/[0.05] p-2.5 sm:mb-3 sm:rounded-2xl sm:p-4">
                      <StepTwoIcon
                        className="h-8 w-8 text-amber-300/90 animate-[food-float_5s_ease-in-out_infinite] sm:h-10 sm:w-10"
                        strokeWidth={1.25}
                      />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary/80 sm:text-[11px] sm:tracking-[0.35em]">
                      Step 2
                    </p>
                    <h2 className="mt-1 text-balance text-xl font-semibold leading-snug tracking-tight text-white sm:mt-2 sm:text-3xl lg:text-4xl">
                      {ONBOARDING_STEPS[1].title}
                    </h2>
                    <p className="mt-2 text-[13px] leading-snug text-white/52 sm:mt-3 sm:text-[15px] sm:leading-relaxed">
                      {ONBOARDING_STEPS[1].body}
                    </p>
                    <div className="mx-auto mt-3 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] sm:mt-4 sm:rounded-2xl lg:mx-0">
                      <div className="grid grid-cols-[1.35fr_0.6fr_1.5fr] border-b border-white/10 px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-white/35 sm:px-4 sm:py-2 sm:text-[11px] sm:tracking-[0.16em]">
                        <span>Ingredient</span>
                        <span className="text-center">Qty</span>
                        <span className="min-w-0 truncate sm:overflow-visible sm:whitespace-normal">Kroger match</span>
                      </div>
                      <ul>
                        {DEMO_INGREDIENTS.map(([name, qty, mapped]) => (
                          <li
                            key={name}
                            className="grid grid-cols-[1.35fr_0.6fr_1.5fr] border-b border-white/[0.06] px-2 py-[5px] text-[10px] leading-tight text-white/65 last:border-b-0 sm:px-4 sm:py-2 sm:text-[13px] sm:leading-snug"
                          >
                            <span className="break-words pr-1">{name}</span>
                            <span className="text-center tabular-nums">{qty}</span>
                            <span className="min-w-0 break-words text-emerald-300/85">{mapped}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left sm:mt-3 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/90 sm:h-5 sm:w-5" />
                      <p className="text-[11px] leading-snug text-white/58 sm:text-[13px] sm:leading-relaxed">{ONBOARDING_STEPS[1].micro}</p>
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="mx-auto flex w-full max-w-md flex-col gap-3 text-center sm:max-w-lg sm:gap-4">
                    <div className="shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary/80 sm:text-[11px] sm:tracking-[0.35em]">
                        Step 3
                      </p>
                      <h2 className="mt-2 text-balance text-xl font-semibold leading-snug tracking-tight text-white sm:text-3xl">
                        {ONBOARDING_STEPS[2].title}
                      </h2>
                      <p className="mx-auto mt-2 max-w-md text-[13px] leading-snug text-white/50 sm:mt-3 sm:text-[15px]">
                        {ONBOARDING_STEPS[2].body}
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2.5 text-left sm:gap-3">
                      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:rounded-2xl sm:gap-3 sm:p-4">
                        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/90 sm:h-5 sm:w-5" />
                        <p className="text-[12px] leading-snug text-white/60 sm:text-[14px] sm:leading-relaxed">{ONBOARDING_STEPS[2].micro}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/35 sm:text-[11px]">Micro Demo</p>
                        <div className="mt-1.5 space-y-1.5 text-[11px] text-white/62 sm:mt-2 sm:space-y-2 sm:text-[13px]">
                          <p className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2 py-1.5 sm:px-3 sm:py-2">
                            <span className="truncate">Pickup location selected</span>
                            <span className="shrink-0 text-emerald-300">Done</span>
                          </p>
                          <p className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2 py-1.5 sm:px-3 sm:py-2">
                            <span className="truncate">Delivery window</span>
                            <span className="shrink-0 text-emerald-300">Done</span>
                          </p>
                          <p className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.05] px-2 py-1.5 sm:px-3 sm:py-2">
                            <span className="truncate">Checkout handoff</span>
                            <span className="shrink-0 text-primary">Ready</span>
                          </p>
                        </div>
                      </div>
                    </div>
                    {connectErr ? (
                      <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-left text-[12px] text-rose-200/90 sm:px-4 sm:py-3 sm:text-[13px]">
                        {connectErr}
                      </p>
                    ) : null}
                    <div className="flex flex-col items-center gap-2 pt-1 sm:gap-3 sm:pt-2">
                      <Button
                        type="button"
                        size="xl"
                        variant="cinematic"
                        disabled={connectBusy}
                        onClick={() => void handleConnectKroger()}
                        className="relative z-10 h-11 w-full max-w-[280px] text-sm sm:h-12 sm:text-base"
                      >
                        {connectBusy ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            {handoff ? "Preparing secure handoff…" : "Opening Kroger…"}
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="h-5 w-5" />
                            Connect Kroger account
                          </>
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        className="text-[12px] text-white/40 underline-offset-4 transition-colors hover:text-white/65 hover:underline sm:text-[13px]"
                      >
                        I&apos;ll do this later
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="surface-glass-soft flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4 sm:px-8 sm:pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={step === 0}
                onClick={goBack}
                className="rounded-full border-white/15 bg-white/[0.04] text-white/85 hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              {step < SCENES - 1 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  variant="secondary"
                  className="rounded-full bg-white/[0.08] px-6 text-white hover:bg-white/14"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleOpenChange(false)}
                  className="rounded-full bg-white/[0.08] px-6 text-white hover:bg-white/14"
                >
                  Finish tour
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </footer>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

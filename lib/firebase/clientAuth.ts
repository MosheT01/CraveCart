"use client"

import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import type { AuthError } from "firebase/auth"

export type LoadedFirebaseBrowserConfig = {
  configured: true
  apiKey: string
  authDomain: string
  projectId: string
}

export type FirebaseBrowserConfigResponse = LoadedFirebaseBrowserConfig | { configured: false }

export async function fetchFirebaseBrowserConfig(): Promise<FirebaseBrowserConfigResponse> {
  const res = await fetch("/api/firebase-public-config", { credentials: "same-origin" })
  if (!res.ok) return { configured: false }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { configured: false }
  }
  if (!data || typeof data !== "object" || !("configured" in data) || data.configured !== true) {
    return { configured: false }
  }
  const d = data as LoadedFirebaseBrowserConfig
  if (!d.apiKey?.trim() || !d.projectId?.trim() || !d.authDomain?.trim()) return { configured: false }
  return d
}

export function getFirebaseBrowserApp(cfg: LoadedFirebaseBrowserConfig): FirebaseApp {
  if (!getApps().length) {
    initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
    })
  }
  return getApps()[0]!
}

export async function postFirebaseSessionCookie(idToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ idToken }),
  })
  const raw = await res.text()

  let body: { error?: string } = {}
  try {
    if (raw.trim()) body = JSON.parse(raw) as { error?: string }
  } catch {
    // Malformed JSON: only surface as failure when HTTP already indicates error.
    if (res.ok) return { ok: true }
    return { ok: false, error: `Server error (${res.status}).` }
  }

  if (!res.ok) return { ok: false, error: body.error || "Could not create session." }
  return { ok: true }
}

export function mapFirebaseAuthError(err: unknown): string {
  const code = (err as AuthError | undefined)?.code
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists."
    case "auth/invalid-email":
      return "Invalid email address."
    case "auth/weak-password":
      return "Password is too weak — use at least 8 characters."
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password."
    case "auth/user-not-found":
      return "Invalid email or password."
    case "auth/too-many-requests":
      return "Too many attempts. Try again shortly."
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This reset link is invalid or expired. Request a new one."
    default:
      if (typeof code === "string" && code.startsWith("auth/")) {
        return "Sign-in failed. Please try again."
      }
      return err instanceof Error ? err.message : "Something went wrong."
  }
}

"use client"

import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { sendPasswordResetEmail, type Auth, type AuthError } from "firebase/auth"

export type LoadedFirebaseBrowserConfig = {
  configured: true
  apiKey: string
  authDomain: string
  projectId: string
}

export type FirebaseBrowserConfigResponse = LoadedFirebaseBrowserConfig | { configured: false }

/**
 * Fetch Firebase browser config from environment variables.
 * In frontend-only mode, these must be set as NEXT_PUBLIC_ env vars.
 */
export async function fetchFirebaseBrowserConfig(): Promise<FirebaseBrowserConfigResponse> {
  // Read from Next.js public environment variables
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ""
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""

  if (!apiKey.trim() || !projectId.trim() || !authDomain.trim()) {
    return { configured: false }
  }

  return {
    configured: true,
    apiKey,
    authDomain,
    projectId,
  }
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

/**
 * Post Firebase session cookie to the backend API.
 * This will be handled by the external backend when connected.
 */
export async function postFirebaseSessionCookie(idToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
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
  } catch (error) {
    // In frontend-only mode, the API may not exist yet
    return { ok: false, error: error instanceof Error ? error.message : "Backend API not available." }
  }
}

/**
 * Sends reset email using your app URL when allowed; falls back without `continueUrl`
 * when Firebase rejects it (`auth/unauthorized-continue-uri` — common if **localhost**
 * isn't under Authentication → **Authorized domains**).
 */
export async function sendCravecartPasswordResetEmail(auth: Auth, email: string, appOrigin: string): Promise<void> {
  const origin = appOrigin.replace(/\/$/, "")
  if (!origin) {
    await sendPasswordResetEmail(auth, email.trim())
    return
  }
  try {
    await sendPasswordResetEmail(auth, email.trim(), {
      url: `${origin}/auth/reset-password`,
      handleCodeInApp: false,
    })
  } catch (err) {
    const code = (err as AuthError | undefined)?.code
    if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri") {
      await sendPasswordResetEmail(auth, email.trim())
      return
    }
    throw err
  }
}

export type FirebaseAuthMessageContext = "signIn" | "passwordReset" | "signUp"

/**
 * Outlook/Hotmail "safe links" prefetch URLs and can consume Firebase's single-use reset code before the user loads
 * the page; Gmail seldom does this — same app, different inbox behavior.
 */
export const FIREBASE_RESET_OUTLOOK_SAFELINKS_HINT =
  "Outlook/Hotmail often scan reset links before you open them (Safe Links), which invalidates the one-time code—copy the link from the email, paste it into the address bar, or request another reset."

export function mapFirebaseAuthError(err: unknown, context: FirebaseAuthMessageContext = "signIn"): string {
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
      return context === "passwordReset"
        ? "No account matches that email, or signup uses a different address."
        : "Invalid email or password."
    case "auth/too-many-requests":
      return "Too many attempts. Try again shortly."
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return context === "passwordReset"
        ? `This reset link is invalid or expired. ${FIREBASE_RESET_OUTLOOK_SAFELINKS_HINT}`
        : "This reset link is invalid or expired. Request a new one."
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
      return context === "passwordReset"
        ? "Firebase rejected the reset landing URL. Under Authentication → **Authorized domains**, add `localhost` (and `127.0.0.1` if you use it). You can retry after saving."
        : "That redirect URL isn't authorized in Firebase Authentication → Authorized domains."
    case "auth/operation-not-allowed":
      return context === "passwordReset"
        ? "Email/password reset isn't enabled. In Firebase Console → Authentication → Sign-in method, enable **Email/Password**."
        : "This sign-in method isn't enabled in Firebase yet."
    case "auth/missing-email":
      return "Enter your email address."
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again."
    default:
      if (typeof code === "string" && code.startsWith("auth/")) {
        const short = code.replace(/^auth\//, "")
        return context === "passwordReset"
          ? `Could not send reset email (${short}). In Firebase Authentication, add localhost to Authorized domains if testing locally.`
          : "Sign-in failed. Please try again."
      }
      return err instanceof Error ? err.message : "Something went wrong."
  }
}

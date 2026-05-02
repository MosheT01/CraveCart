import fs from "node:fs"

import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

let appSingleton: App | null = null

function serviceAccountRawString(): string | null {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, "utf8").trim()
      if (raw.startsWith("{")) return raw
    } catch {
      /* try inline */
    }
  }
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (inline?.startsWith("{")) return inline
  return null
}

function serviceAccountObject(): Record<string, unknown> | null {
  const raw = serviceAccountRawString()
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

export function firebaseAdminConfigured(): boolean {
  const o = serviceAccountObject()
  return !!o && typeof o.project_id === "string"
}

/** From `FIREBASE_PROJECT_ID` or parsed service account file / JSON. */
export function inferFirebaseProjectId(): string | null {
  const fromEnv = process.env.FIREBASE_PROJECT_ID?.trim()
  if (fromEnv) return fromEnv
  const o = serviceAccountObject()
  return o && typeof o.project_id === "string" ? (o.project_id as string) : null
}

function ensureApp(): App {
  const sa = serviceAccountObject()
  if (!sa || typeof sa.project_id !== "string") {
    throw new Error(
      "Set FIREBASE_SERVICE_ACCOUNT_PATH (JSON file) or FIREBASE_SERVICE_ACCOUNT_JSON — CraveCart is Firebase-only.",
    )
  }
  if (appSingleton) return appSingleton
  if (getApps().length > 0) {
    appSingleton = getApps()[0]!
    return appSingleton
  }
  appSingleton = initializeApp({
    credential: cert(sa as unknown as ServiceAccount),
    projectId: sa.project_id as string,
  })
  return appSingleton
}

export function getFirebaseAdminAuth() {
  return getAuth(ensureApp())
}

export function getFirebaseAdminFirestore() {
  return getFirestore(ensureApp())
}

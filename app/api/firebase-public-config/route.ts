import { NextResponse } from "next/server"

import { firebaseAdminConfigured, inferFirebaseProjectId } from "@/lib/server/firebase/admin"

export const runtime = "nodejs"

/** Public web SDK config (API key is not a server secret; restrict domains in Firebase Console). */
export async function GET() {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim()
  const projectId = inferFirebaseProjectId()
  if (!firebaseAdminConfigured() || !apiKey || !projectId) {
    return NextResponse.json({ configured: false as const })
  }
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`
  return NextResponse.json({
    configured: true as const,
    apiKey,
    projectId,
    authDomain,
  })
}

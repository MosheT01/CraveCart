import { getUserFromFirebaseSessionCookie } from "@/lib/server/auth/firebaseSessionCookie"
import { firebaseAdminConfigured } from "@/lib/server/firebase/admin"
import type { PublicUser } from "@/lib/server/auth/publicUser"

export type { PublicUser }

export async function getSessionUser(): Promise<PublicUser | null> {
  if (!firebaseAdminConfigured()) return null
  return getUserFromFirebaseSessionCookie()
}

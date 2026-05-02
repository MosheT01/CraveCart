import { randomUUID } from "node:crypto"

import { readSessionId, setKrogerSessionCookie } from "@/lib/kroger/session"
import { getKrogerMcpSessionId, setKrogerMcpSessionId } from "@/lib/server/krogerUserPrefs"

/** Binds Firebase uid ↔ opaque Kroger MCP session id in Firestore and syncs httpOnly cookie. */
export async function syncKrogerBrowserSessionForUser(uid: string): Promise<string> {
  const stored = await getKrogerMcpSessionId(uid)
  const cookieNow = await readSessionId()

  if (stored) {
    if (cookieNow !== stored) {
      await setKrogerSessionCookie(stored)
    }
    return stored
  }

  if (cookieNow) {
    await setKrogerMcpSessionId(uid, cookieNow)
    return cookieNow
  }

  const fresh = randomUUID()
  await setKrogerMcpSessionId(uid, fresh)
  await setKrogerSessionCookie(fresh)
  return fresh
}

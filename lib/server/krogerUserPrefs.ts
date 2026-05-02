import { getFirebaseAdminFirestore } from "@/lib/server/firebase/admin"

const COLLECTION = "cravecart_user_prefs"

function docRef(userId: string) {
  return getFirebaseAdminFirestore().collection(COLLECTION).doc(userId)
}

export async function getKrogerMcpSessionId(userId: string): Promise<string | null> {
  const snap = await docRef(userId).get()
  const raw = snap.data()?.krogerMcpSessionId
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

export async function setKrogerMcpSessionId(userId: string, sessionId: string): Promise<void> {
  await docRef(userId).set({ krogerMcpSessionId: sessionId }, { merge: true })
}

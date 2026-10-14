import type { ChatSessionMeta, StoredChatMessage } from "@/lib/server/chatTypes"
import type { AgentSessionState } from "@/lib/agent/sessionState"
import { getFirebaseAdminFirestore } from "@/lib/server/firebase/admin"

export type { ChatSessionMeta, StoredChatMessage }

const COLLECTION = "cravecart_user_chats"
const MAX_SESSIONS = 40

interface UserChatDoc {
  sessions: ChatSessionMeta[]
  messagesBySession: Record<string, StoredChatMessage[]>
  agentStateBySession: Record<string, AgentSessionState>
}

function docRef(userId: string) {
  return getFirebaseAdminFirestore().collection(COLLECTION).doc(userId)
}

let writeChains = new Map<string, Promise<void>>()

function chainFor(userId: string): { run: <T>(fn: () => Promise<T>) => Promise<T> } {
  let p = writeChains.get(userId) ?? Promise.resolve()
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      let out!: T
      p = p.then(async () => {
        out = await fn()
      })
      writeChains.set(userId, p)
      await p
      return out
    },
  }
}

async function read(userId: string): Promise<UserChatDoc> {
  const snap = await docRef(userId).get()
  if (!snap.exists) return { sessions: [], messagesBySession: {}, agentStateBySession: {} }
  const d = snap.data() as Partial<UserChatDoc> | undefined
  return {
    sessions: Array.isArray(d?.sessions) ? d!.sessions : [],
    messagesBySession:
      d?.messagesBySession && typeof d.messagesBySession === "object" ? d.messagesBySession : {},
    agentStateBySession:
      d?.agentStateBySession && typeof d.agentStateBySession === "object" ? d.agentStateBySession : {},
  }
}

async function write(userId: string, data: UserChatDoc): Promise<void> {
  await docRef(userId).set({
    sessions: data.sessions,
    messagesBySession: data.messagesBySession,
    agentStateBySession: data.agentStateBySession,
  })
}

export async function getPersistedAgentSessionState(userId: string, sessionId: string): Promise<AgentSessionState | null> {
  const data = await read(userId)
  return data.agentStateBySession[sessionId] ?? null
}

export async function setPersistedAgentSessionState(
  userId: string,
  sessionId: string,
  state: Omit<AgentSessionState, "updatedAt">,
): Promise<void> {
  await chainFor(userId).run(async () => {
    const data = await read(userId)
    data.agentStateBySession[sessionId] = { ...state, updatedAt: Date.now() }
    await write(userId, data)
  })
}

export async function listSessions(userId: string): Promise<ChatSessionMeta[]> {
  const data = await read(userId)
  return [...data.sessions].sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSessionMessages(userId: string, sessionId: string): Promise<StoredChatMessage[]> {
  const data = await read(userId)
  return data.messagesBySession[sessionId] ?? []
}

export async function upsertSessionBundle(
  userId: string,
  sessionId: string,
  title: string,
  messages: StoredChatMessage[],
): Promise<void> {
  await chainFor(userId).run(async () => {
    const data = await read(userId)
    const idx = data.sessions.findIndex((s) => s.id === sessionId)
    const now = Date.now()
    if (idx === -1) {
      data.sessions.unshift({ id: sessionId, title, createdAt: now })
    } else {
      data.sessions[idx] = { ...data.sessions[idx], title }
    }
    data.messagesBySession[sessionId] = messages
    data.sessions.sort((a, b) => b.createdAt - a.createdAt)
    if (data.sessions.length > MAX_SESSIONS) {
      const drop = data.sessions.slice(MAX_SESSIONS)
      data.sessions = data.sessions.slice(0, MAX_SESSIONS)
      for (const s of drop) delete data.messagesBySession[s.id]
    }
    await write(userId, data)
  })
}

export async function replaceAllFromClient(
  userId: string,
  sessions: ChatSessionMeta[],
  messagesBySession: Record<string, StoredChatMessage[]>,
): Promise<void> {
  await chainFor(userId).run(async () => {
    const data = await read(userId)
    const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SESSIONS)
    const kept = new Set(sorted.map((s) => s.id))
    const pruned: Record<string, StoredChatMessage[]> = {}
    for (const id of kept) {
      if (messagesBySession[id]) pruned[id] = messagesBySession[id]
    }
    const agentStateBySession: Record<string, AgentSessionState> = {}
    for (const id of kept) {
      if (data.agentStateBySession[id]) agentStateBySession[id] = data.agentStateBySession[id]
    }
    await write(userId, { sessions: sorted, messagesBySession: pruned, agentStateBySession })
  })
}

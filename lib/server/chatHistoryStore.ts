import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { getDataDir } from "@/lib/server/paths"

export interface ChatSessionMeta {
  id: string
  title: string
  createdAt: number
}

export interface StoredChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  video: unknown | null
  cart: unknown | null
}

interface UserChatFile {
  sessions: ChatSessionMeta[]
  messagesBySession: Record<string, StoredChatMessage[]>
}

const MAX_SESSIONS = 40

function filePath(userId: string) {
  return path.join(getDataDir(), "chat-history", `${userId}.json`)
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

async function read(userId: string): Promise<UserChatFile> {
  const p = filePath(userId)
  try {
    const raw = await fs.readFile(p, "utf8")
    const data = JSON.parse(raw) as UserChatFile
    if (!data.sessions) data.sessions = []
    if (!data.messagesBySession) data.messagesBySession = {}
    return data
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === "ENOENT") return { sessions: [], messagesBySession: {} }
    throw e
  }
}

async function write(userId: string, data: UserChatFile): Promise<void> {
  const p = filePath(userId)
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8")
  await fs.rename(tmp, p)
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
    const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SESSIONS)
    const kept = new Set(sorted.map((s) => s.id))
    const pruned: Record<string, StoredChatMessage[]> = {}
    for (const id of kept) {
      if (messagesBySession[id]) pruned[id] = messagesBySession[id]
    }
    await write(userId, { sessions: sorted, messagesBySession: pruned })
  })
}

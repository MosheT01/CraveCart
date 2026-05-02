import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { getDataDir } from "@/lib/server/paths"
import { getAuthSecret } from "@/lib/server/auth/secret"
import { hashPassword, verifyPassword } from "@/lib/server/auth/password"

export interface UserRecord {
  id: string
  email: string
  emailNorm: string
  name: string
  passwordHash: string
  passwordSalt: string
  createdAt: number
  resetTokenDigest?: string
  resetTokenExpires?: number
}

interface UsersFile {
  users: UserRecord[]
}

const FILE = "users.json"

let writeChain: Promise<void> = Promise.resolve()

function usersPath() {
  return path.join(getDataDir(), FILE)
}

async function readFile(): Promise<UsersFile> {
  const p = usersPath()
  try {
    const raw = await fs.readFile(p, "utf8")
    const data = JSON.parse(raw) as UsersFile
    if (!data.users || !Array.isArray(data.users)) return { users: [] }
    return data
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === "ENOENT") return { users: [] }
    throw e
  }
}

async function writeFile(data: UsersFile): Promise<void> {
  const p = usersPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8")
  await fs.rename(tmp, p)
}

export async function withUserStore<T>(fn: (file: UsersFile) => Promise<T>): Promise<T> {
  let result!: T
  writeChain = writeChain.then(async () => {
    const file = await readFile()
    result = await fn(file)
  })
  await writeChain
  return result
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function digestResetToken(token: string): string {
  return createHash("sha256").update(token + getAuthSecret()).digest("hex")
}

export async function findUserByEmailNorm(emailNorm: string): Promise<UserRecord | null> {
  const { users } = await readFile()
  return users.find((u) => u.emailNorm === emailNorm) ?? null
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { users } = await readFile()
  return users.find((u) => u.id === id) ?? null
}

export async function createUser(input: {
  email: string
  name: string
  password: string
}): Promise<UserRecord> {
  const emailNorm = normalizeEmail(input.email)
  const { hash, salt } = await hashPassword(input.password)
  const user: UserRecord = {
    id: randomUUID(),
    email: input.email.trim(),
    emailNorm,
    name: input.name.trim(),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: Date.now(),
  }

  return withUserStore(async (file) => {
    if (file.users.some((u) => u.emailNorm === emailNorm)) {
      throw new Error("EMAIL_TAKEN")
    }
    file.users.push(user)
    await writeFile(file)
    return user
  })
}

export async function verifyUserLogin(email: string, password: string): Promise<UserRecord | null> {
  const emailNorm = normalizeEmail(email)
  const user = await findUserByEmailNorm(emailNorm)
  if (!user) return null
  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash)
  return ok ? user : null
}

export async function setPasswordForUser(userId: string, newPassword: string): Promise<void> {
  const { hash, salt } = await hashPassword(newPassword)
  await withUserStore(async (file) => {
    const u = file.users.find((x) => x.id === userId)
    if (!u) throw new Error("USER_NOT_FOUND")
    u.passwordHash = hash
    u.passwordSalt = salt
    delete u.resetTokenDigest
    delete u.resetTokenExpires
    await writeFile(file)
  })
}

export async function setPasswordResetToken(userId: string, token: string, expiresAt: number): Promise<void> {
  const digest = digestResetToken(token)
  await withUserStore(async (file) => {
    const u = file.users.find((x) => x.id === userId)
    if (!u) throw new Error("USER_NOT_FOUND")
    u.resetTokenDigest = digest
    u.resetTokenExpires = expiresAt
    await writeFile(file)
  })
}

export async function finalizePasswordReset(emailNorm: string, token: string, newPassword: string): Promise<boolean> {
  const digest = digestResetToken(token)
  const { hash, salt } = await hashPassword(newPassword)
  return withUserStore(async (file) => {
    const u = file.users.find((x) => x.emailNorm === emailNorm)
    if (!u || !u.resetTokenDigest || !u.resetTokenExpires) return false
    if (u.resetTokenExpires < Date.now()) return false
    if (u.resetTokenDigest !== digest) return false
    u.passwordHash = hash
    u.passwordSalt = salt
    delete u.resetTokenDigest
    delete u.resetTokenExpires
    await writeFile(file)
    return true
  })
}

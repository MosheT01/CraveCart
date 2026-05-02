import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scryptAsync = promisify(scrypt)

const SALT_LEN = 16
const KEY_LEN = 64

export async function hashPassword(plain: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_LEN)
  const derived = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer
  return { hash: derived.toString("base64"), salt: salt.toString("base64") }
}

export async function verifyPassword(plain: string, saltB64: string, hashB64: string): Promise<boolean> {
  const salt = Buffer.from(saltB64, "base64")
  const expected = Buffer.from(hashB64, "base64")
  const derived = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

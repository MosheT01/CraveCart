export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET?.trim()
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV !== "production") {
    return "__dev_cravecart_auth_secret_change_me__"
  }
  throw new Error("AUTH_SECRET must be set (at least 16 characters) in production.")
}

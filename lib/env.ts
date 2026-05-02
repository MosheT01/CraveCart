const TRUE_VALUES = new Set(["1", "true", "yes", "on"])

export function readEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback
}

export function readBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name]

  if (!value) {
    return fallback
  }

  return TRUE_VALUES.has(value.trim().toLowerCase())
}

export function getGeminiModel(): string {
  return readEnv("GEMINI_MODEL", "gemini-2.5-flash")
}

export function isGeminiConfigured(): boolean {
  return Boolean(readEnv("GEMINI_API_KEY"))
}

export function getAppBaseUrl(): string {
  return readEnv("APP_BASE_URL", "http://localhost:3000")
}

/** Mounted MCP apps use `/mcp/`; without trailing slash Starlette redirects and can downgrade to http behind proxies. */
function normalizeMountedMcpUrl(envName: string, defaultWithoutSlash: string): string {
  const raw = readEnv(envName, defaultWithoutSlash).replace(/\/+$/u, "")
  const withMount = /\/mcp$/i.test(raw) ? raw : `${raw}/mcp`
  return `${withMount}/`
}

export function getYouTubeMcpUrl(): string {
  return normalizeMountedMcpUrl("YOUTUBE_MCP_URL", "http://youtube-mcp:8100/mcp")
}

export function getYouTubeServiceUrl(): string {
  return readEnv("YOUTUBE_SERVICE_URL", getYouTubeMcpUrl().replace(/\/mcp\/?$/i, ""))
}

export function getKrogerServiceUrl(): string {
  return readEnv("KROGER_SIDECAR_URL", "http://kroger-mcp:8000")
}

export function getKrogerMcpUrl(): string {
  return normalizeMountedMcpUrl(
    "KROGER_MCP_URL",
    `${getKrogerServiceUrl().replace(/\/$/, "")}/mcp`,
  )
}

export function areKrogerCredentialsConfigured(): boolean {
  return Boolean(
    readEnv("KROGER_CLIENT_ID") &&
      readEnv("KROGER_CLIENT_SECRET") &&
      readEnv("KROGER_REDIRECT_URI") &&
      readEnv("KROGER_LOCATION_ID"),
  )
}

export function isYouTubeConfigured(): boolean {
  return Boolean(readEnv("YOUTUBE_API_KEY"))
}

/** Per-request MCP tools/call timeout (ms); cold starts + YouTube often need more than SDK default (60s). */
export function getMcpToolTimeoutMs(): number {
  const raw = readEnv("MCP_TOOL_TIMEOUT_MS", "180000")
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 15000) {
    return 180000
  }
  return parsed
}

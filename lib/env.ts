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

export function getYouTubeMcpUrl(): string {
  return readEnv("YOUTUBE_MCP_URL", "http://youtube-mcp:8100/mcp")
}

export function getYouTubeServiceUrl(): string {
  return readEnv("YOUTUBE_SERVICE_URL", getYouTubeMcpUrl().replace(/\/mcp\/?$/, ""))
}

export function getKrogerServiceUrl(): string {
  return readEnv("KROGER_SIDECAR_URL", "http://kroger-mcp:8000")
}

export function getKrogerMcpUrl(): string {
  return readEnv("KROGER_MCP_URL", `${getKrogerServiceUrl().replace(/\/$/, "")}/mcp`)
}

export function areKrogerCredentialsConfigured(): boolean {
  return Boolean(
    readEnv("KROGER_CLIENT_ID") &&
      readEnv("KROGER_CLIENT_SECRET") &&
      readEnv("KROGER_REDIRECT_URI") &&
      readEnv("KROGER_LOCATION_ID"),
  )
}

export function isMockKrogerMode(): boolean {
  return readBooleanEnv("KROGER_MOCK_MODE", false) || !areKrogerCredentialsConfigured()
}

export function isYouTubeConfigured(): boolean {
  return Boolean(readEnv("YOUTUBE_API_KEY"))
}

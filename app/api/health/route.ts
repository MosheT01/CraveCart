import { NextResponse } from "next/server"
import { areKrogerCredentialsConfigured, getYouTubeServiceUrl, isGeminiConfigured, isYouTubeConfigured, readEnv } from "@/lib/env"
import { KrogerClient } from "@/lib/kroger/KrogerClient"

export async function GET() {
  const client = new KrogerClient()
  const sidecarHealth = await client.health()
  const youtubeHealth = await fetch(`${getYouTubeServiceUrl()}/health`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        return { ok: false }
      }
      return response.json()
    })
    .catch(() => ({ ok: false }))

  return NextResponse.json({
    service: readEnv("K_SERVICE", "cravecart-web"),
    revision: readEnv("K_REVISION"),
    gitSha: readEnv("GIT_SHA"),
    checkedAt: new Date().toISOString(),
    geminiConfigured: isGeminiConfigured(),
    youTubeConfigured: isYouTubeConfigured(),
    youtubeMcpHealthy: youtubeHealth.ok,
    krogerCredentialsConfigured: areKrogerCredentialsConfigured(),
    sidecarHealthy: sidecarHealth.ok,
  })
}

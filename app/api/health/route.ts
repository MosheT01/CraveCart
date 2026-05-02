import { NextResponse } from "next/server"
import { areKrogerCredentialsConfigured, getYouTubeServiceUrl, isGeminiConfigured, isYouTubeConfigured, readEnv } from "@/lib/env"
import { KrogerClient } from "@/lib/kroger/KrogerClient"
import { augmentSidecarHeaders } from "@/lib/server/sidecarGatewayFetch"

export async function GET() {
  const client = new KrogerClient()
  const sidecarHealth = await client.health()
  const youtubeUrl = `${getYouTubeServiceUrl()}/health`
  const youtubeHeaders = await augmentSidecarHeaders(youtubeUrl)
  const youtubeHealth = await fetch(youtubeUrl, {
    cache: "no-store",
    headers: youtubeHeaders,
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

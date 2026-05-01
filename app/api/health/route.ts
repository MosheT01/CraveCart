import { NextResponse } from "next/server"
import { getYouTubeServiceUrl, isGeminiConfigured, isMockKrogerMode, isYouTubeConfigured } from "@/lib/env"
import { KrogerClient } from "@/lib/kroger/KrogerClient"

export async function GET() {
  const mockMode = isMockKrogerMode()
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
    geminiConfigured: isGeminiConfigured(),
    youTubeConfigured: isYouTubeConfigured(),
    youtubeMcpHealthy: youtubeHealth.ok,
    krogerMockMode: mockMode,
    krogerConfigured: !mockMode,
    sidecarHealthy: sidecarHealth.ok,
  })
}

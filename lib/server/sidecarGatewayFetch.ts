/**
 * Sidecars (YouTube MCP on Cloud Run, Kroger MCP on Fly) must not rely on obscurity alone.
 * - Cloud Run: attach a Google-signed ID token (audience = service URL origin).
 * - Non–Cloud Run (Fly, docker network): attach INTERNAL_SIDECAR_SECRET bearer when configured.
 */
import { readEnv } from "@/lib/env"

export function getInternalSidecarSecret(): string {
  return readEnv("INTERNAL_SIDECAR_SECRET", "")
}

export function isCloudRunServiceUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr)
    return hostname.endsWith(".run.app")
  } catch {
    return false
  }
}

export async function augmentSidecarHeaders(targetUrlStr: string, base?: HeadersInit): Promise<Headers> {
  const out = new Headers(base ?? {})

  try {
    if (isCloudRunServiceUrl(targetUrlStr)) {
      const target = new URL(targetUrlStr)
      const audience = `${target.protocol}//${target.host}`
      const { GoogleAuth } = await import("google-auth-library")
      const auth = new GoogleAuth()
      const client = await auth.getIdTokenClient(audience)
      const tokenHeaders = await client.getRequestHeaders()
      const bearer = new Headers(tokenHeaders as HeadersInit).get("Authorization")
      if (bearer) {
        out.set("Authorization", bearer)
      }
    } else {
      const secret = getInternalSidecarSecret()
      if (secret) {
        out.set("Authorization", `Bearer ${secret}`)
      }
    }
  } catch {
    // Unauthenticated outbound call; Cloud Run returns 403.
  }

  return out
}

/** Fetch used by MCP Streamable HTTP transport. */
export async function sidecarGatewayFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const resolved = typeof url === "string" ? url : url.href
  const headers = await augmentSidecarHeaders(resolved, init?.headers)
  return fetch(typeof url === "string" ? url : url.href, {
    ...init,
    headers,
  })
}

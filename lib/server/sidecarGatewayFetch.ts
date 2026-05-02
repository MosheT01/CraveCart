/**
 * Sidecars (YouTube MCP on Cloud Run, Kroger MCP on Fly) must not rely on obscurity alone.
 * - Cloud Run: attach a Google-signed ID token (audience = service URL origin).
 * - Non–Cloud Run (Fly, docker network): attach INTERNAL_SIDECAR_SECRET bearer when configured.
 */
import { readEnv } from "@/lib/env"

/** Normalize Secret Manager payloads that accidentally include CRLF/TAB/null — invalid in HTTP Bearer and often cause 400 from edges. */
function normalizeBearerSecret(raw: string): string {
  return raw.replace(/\u0000|\r|\n|\t/g, "")
}

export function getInternalSidecarSecret(): string {
  return normalizeBearerSecret(readEnv("INTERNAL_SIDECAR_SECRET", ""))
}

export function isCloudRunServiceUrl(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr)
    return hostname.endsWith(".run.app")
  } catch {
    return false
  }
}

/** Targets that use INTERNAL_SIDECAR_SECRET (Fly, bare Cloud Run–invoked hosts, custom domains) — not GCP *.run.app (ID token). */
function outboundSidecarNeedsSharedSecret(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h.endsWith(".run.app")) return false
  if (h === "localhost" || h.startsWith("127.") || h.endsWith(".localhost")) return false
  if (h.endsWith(".fly.dev") || h.endsWith(".fly.io")) return true
  // Docker Compose / K8 short names (kroger-mcp, youtube-mcp) — no bearer required when secret unset.
  if (!h.includes(".")) return false
  return true
}

export async function augmentSidecarHeaders(targetUrlStr: string, base?: HeadersInit): Promise<Headers> {
  const out = new Headers(base ?? {})

  let hostname: string
  try {
    hostname = new URL(targetUrlStr).hostname
  } catch {
    return out
  }

  if (isCloudRunServiceUrl(targetUrlStr)) {
    try {
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
    } catch {
      // ID token failure; YouTube MCP IAM will 403 — see Cloud Run runtime SA roles/run.invoker.
    }
    return out
  }

  const secret = getInternalSidecarSecret()
  const onCloudRun = Boolean(process.env.K_SERVICE)
  if (onCloudRun && outboundSidecarNeedsSharedSecret(hostname) && !secret) {
    throw new Error(
      "cravecart-web cannot call the Fly Kroger MCP: INTERNAL_SIDECAR_SECRET is unset in this container. " +
        "In Cloud Run deploy, add `--set-secrets INTERNAL_SIDECAR_SECRET=INTERNAL_SIDECAR_SECRET:latest` (and Secret Manager accessor IAM), " +
        "then redeploy web. On Fly, publish the same Secret Manager value (`deploy-fly-ci.sh` / `-FromGcpSecretManager`).",
    )
  }

  if (secret) {
    out.set("Authorization", `Bearer ${secret}`)
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

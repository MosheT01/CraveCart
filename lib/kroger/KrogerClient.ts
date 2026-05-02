import { devLog } from "@/lib/dev"
import { getKrogerServiceUrl } from "@/lib/env"
import type { CartAddOutcome, CartItemRequest, KrogerAuthCallbackResponse, KrogerAuthStartResponse, KrogerHealthResponse, KrogerProduct } from "@/lib/types"

interface KrogerClientOptions {
  sessionId?: string | null
}

export class KrogerClient {
  private readonly sessionId: string | null
  private readonly baseUrl: string

  constructor(options: KrogerClientOptions = {}) {
    this.sessionId = options.sessionId ?? null
    this.baseUrl = getKrogerServiceUrl()
  }

  async getAuthorizationUrl(): Promise<string> {
    const payload = await this.post<KrogerAuthStartResponse>("/auth/start", {})
    return payload.authUrl
  }

  async exchangeCodeForToken(code: string, state: string): Promise<KrogerAuthCallbackResponse> {
    return this.post<KrogerAuthCallbackResponse>("/auth/callback", {
      code,
      state,
    })
  }

  async refreshToken(refreshToken: string): Promise<{ ok: boolean; refreshToken: string }> {
    return { ok: true, refreshToken }
  }

  async searchProducts(_query: string, _locationId: string): Promise<KrogerProduct[]> {
    throw new Error("Kroger product search is handled through the MCP runtime in the active agent path.")
  }

  async addToCart(_items: CartItemRequest[]): Promise<{ authenticated: boolean; results: CartAddOutcome[] }> {
    throw new Error("Kroger cart writes are handled through the MCP runtime in the active agent path.")
  }

  async health(): Promise<KrogerHealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.buildHeaders(),
      cache: "no-store",
    })

    if (!response.ok) {
      return { ok: false, configured: false, authenticated: false }
    }

    return response.json()
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    devLog("kroger_http_request", { path, hasSession: Boolean(this.sessionId) })
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Kroger request failed: ${response.status} ${text}`)
    }

    return response.json() as Promise<T>
  }

  private buildHeaders(): HeadersInit {
    return this.sessionId ? { "X-CraveCart-Session": this.sessionId } : {}
  }
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { getKrogerMcpUrl, getYouTubeMcpUrl } from "@/lib/env"

interface McpConnection {
  client: Client
  transport: StreamableHTTPClientTransport
}

export interface ParsedMcpToolResult<T> {
  raw: unknown
  data: T
}

export class AgentMcpClients {
  private youtube: Promise<McpConnection> | null = null
  private kroger: Promise<McpConnection> | null = null

  async callYoutubeTool<T>(name: string, args: Record<string, unknown>) {
    const connection = await this.getYouTube()
    const result = await connection.client.callTool({
      name,
      arguments: args,
    })
    return parseMcpToolResult<T>(result)
  }

  async callKrogerTool<T>(name: string, args: Record<string, unknown>) {
    const connection = await this.getKroger()
    const result = await connection.client.callTool({
      name,
      arguments: args,
    })
    return parseMcpToolResult<T>(result)
  }

  async close() {
    for (const pending of [this.youtube, this.kroger]) {
      if (!pending) {
        continue
      }

      const connection = await pending
      try {
        await connection.transport.terminateSession()
      } catch {
        // Stateless servers may reject explicit termination.
      }
      await connection.client.close()
    }
  }

  private getYouTube() {
    if (!this.youtube) {
      this.youtube = connect(getYouTubeMcpUrl())
    }

    return this.youtube
  }

  private getKroger() {
    if (!this.kroger) {
      this.kroger = connect(getKrogerMcpUrl())
    }

    return this.kroger
  }
}

async function connect(url: string): Promise<McpConnection> {
  const client = new Client({
    name: "cravecart-agent-host",
    version: "0.2.0",
  })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)
  return { client, transport }
}

function parseMcpToolResult<T>(result: {
  structuredContent?: Record<string, unknown>
  content?: Array<{ type: string; text?: string }>
  toolResult?: unknown
}): ParsedMcpToolResult<T> {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return {
      raw: result,
      data: result.structuredContent as T,
    }
  }

  const textPart = result.content?.find((entry) => entry.type === "text" && typeof entry.text === "string")
  if (textPart?.text) {
    try {
      return {
        raw: result,
        data: JSON.parse(textPart.text) as T,
      }
    } catch {
      return {
        raw: result,
        data: { text: textPart.text } as T,
      }
    }
  }

  return {
    raw: result,
    data: (result.toolResult ?? {}) as T,
  }
}

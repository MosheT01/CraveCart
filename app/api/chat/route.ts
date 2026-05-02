import { runAgentTurn } from "@/lib/agent/runAgentTurn"
import { chatRequestSchema } from "@/lib/agent/schemas"
import { getSessionUser } from "@/lib/server/auth/getSessionUser"
import { ensureSessionId } from "@/lib/kroger/session"

export const runtime = "nodejs"

const encoder = new TextEncoder()

export async function POST(request: Request) {
  const authedUser = await getSessionUser()
  if (!authedUser) {
    return new Response(JSON.stringify({ type: "error", message: "Sign in to chat." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  let payload: ReturnType<typeof chatRequestSchema.parse> | null = null

  try {
    payload = chatRequestSchema.parse(await request.json())
  } catch (error) {
    return new Response(
      JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Invalid chat request.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  const sessionId = await ensureSessionId()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await runAgentTurn(
          {
            messages: payload!.messages,
            sessionId,
          },
          async (event) => {
            send(event.type, event)
          },
        )
      } catch (error) {
        send("error", {
          type: "error",
          message: error instanceof Error ? error.message : "Agent execution failed.",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

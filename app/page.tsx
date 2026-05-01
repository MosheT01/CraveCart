"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, ChevronRight, Loader2 } from "lucide-react"
import { AgentActivityPanel } from "@/components/AgentActivityPanel"
import { CartReadyCard } from "@/components/CartReadyCard"
import { ChatInput } from "@/components/ChatInput"
import { ChatMarkdown } from "@/components/ChatMarkdown"
import { VideoResultCard } from "@/components/VideoResultCard"
import { Button } from "@/components/ui/button"
import type { AgentStreamEvent, CartArtifact, ChatMessage, ToolTraceEntry, VideoArtifact } from "@/lib/types"

const EXAMPLES = [
  "I'm craving an American cheeseburger",
  "Buy milk",
  "Tell me about a chicken Alfredo video",
  "Find a good chicken alfredo video and buy the groceries",
]

interface UiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status: "idle" | "streaming" | "error"
  traces: ToolTraceEntry[]
  video: VideoArtifact | null
  cart: CartArtifact | null
  authUrl: string | null
  error: string | null
}

export default function HomePage() {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = messagesViewportRef.current
    const end = messagesEndRef.current
    if (!viewport || !end) {
      return
    }

    end.scrollIntoView({
      block: "end",
      behavior: messages.length > 0 ? "smooth" : "auto",
    })
  }, [messages])

  async function submitPrompt(prompt: string) {
    if (isSending) {
      return
    }

    const userMessage: UiMessage = makeUserMessage(prompt)
    const assistantMessage: UiMessage = makeAssistantPlaceholder()
    const historyForRequest = [...messages, userMessage]
    const nextMessages = [...historyForRequest, assistantMessage]

    setMessages(nextMessages)
    setIsSending(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: toChatHistory(historyForRequest),
        }),
      })

      if (!response.ok || !response.body) {
        const text = await response.text()
        throw new Error(text || "Could not reach the CraveCart agent.")
      }

      await consumeEventStream(response.body, assistantMessage.id)
    } catch (error) {
      updateAssistantMessage(assistantMessage.id, (current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Could not reach the CraveCart agent.",
        content: current.content || "I couldn't complete that request.",
      }))
    } finally {
      setIsSending(false)
    }
  }

  async function consumeEventStream(body: ReadableStream<Uint8Array>, assistantId: string) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf("\n\n")

      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")

        const parsed = parseSseEvent(chunk)
        if (!parsed) {
          continue
        }

        applyAgentEvent(assistantId, parsed)
      }
    }

    updateAssistantMessage(assistantId, (current) => ({
      ...current,
      status: current.status === "error" ? "error" : "idle",
      content: current.content || "I finished the request.",
    }))
  }

  function applyAgentEvent(assistantId: string, event: AgentStreamEvent) {
    switch (event.type) {
      case "assistant_text_delta":
        updateAssistantMessage(assistantId, (current) => ({
          ...current,
          content: `${current.content}${event.delta}`,
        }))
        break
      case "tool_call_started":
      case "tool_call_finished":
        updateAssistantMessage(assistantId, (current) => {
          const nextVideo = event.type === "tool_call_finished" ? deriveVideoArtifact(event.trace) ?? current.video : current.video
          return {
            ...current,
            traces: [...current.traces, event.trace],
            video: nextVideo,
          }
        })
        break
      case "needs_kroger_auth":
        updateAssistantMessage(assistantId, (current) => ({
          ...current,
          status: "idle",
          authUrl: event.authUrl,
          traces: event.activity,
          video: event.artifact ?? current.video,
        }))
        break
      case "cart_ready":
        updateAssistantMessage(assistantId, (current) => ({
          ...current,
          status: "idle",
          cart: event.cart,
          traces: event.activity,
        }))
        break
      case "error":
        updateAssistantMessage(assistantId, (current) => ({
          ...current,
          status: "error",
          error: event.message,
          content: current.content || event.message,
        }))
        break
    }
  }

  function updateAssistantMessage(messageId: string, updater: (message: UiMessage) => UiMessage) {
    setMessages((current) => current.map((message) => (message.id === messageId ? updater(message) : message)))
  }

  return (
    <main className="relative z-10 h-screen overflow-hidden px-4 pb-3 pt-4 text-white md:px-6">
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <section className="flex min-h-0 flex-1 flex-col">
          <div
            ref={messagesViewportRef}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1"
          >
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-end pb-2">
                <article className="mr-auto w-full max-w-3xl">
                  <div className="rounded-[30px] border border-white/10 bg-black/28 px-5 py-5 text-white backdrop-blur-xl">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/40">CraveCart</p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-[2rem]">
                      Food planning and Kroger cart actions in one chat.
                    </h1>
                    <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white/72">
                      Ask for a recipe, groceries, video context, or all three together. Gemini handles the orchestration and streams live tool progress as it works.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">YouTube search and transcripts</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">Kroger product matching</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">Live cart actions</span>
                    </div>
                    <p className="mt-4 text-xs uppercase tracking-[0.22em] text-white/38">
                      Using your configured Kroger store location
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => submitPrompt(example)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}

            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-auto max-w-2xl" : "mr-auto w-full max-w-3xl"}>
                <div
                  className={
                    message.role === "user"
                      ? "rounded-[26px] border border-primary/18 bg-primary/12 px-5 py-4 text-white shadow-[0_14px_50px_rgba(0,0,0,0.18)]"
                      : "rounded-[30px] border border-white/10 bg-black/28 px-5 py-5 text-white backdrop-blur-xl"
                  }
                >
                  <p className={message.role === "user" ? "text-xs uppercase tracking-[0.24em] text-primary/80" : "text-xs uppercase tracking-[0.24em] text-white/40"}>
                    {message.role === "user" ? "You" : "CraveCart"}
                  </p>
                  <div className="mt-3">
                    {message.content ? <ChatMarkdown content={message.content.trim()} tone={message.role === "assistant" ? "assistant" : "user"} /> : null}
                    {message.status === "streaming" && !message.content ? (
                      <div className="flex items-center gap-2 text-white/65">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Working across YouTube and Kroger...
                      </div>
                    ) : null}
                    {message.error ? (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-300/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{message.error}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {message.role === "assistant" ? <div className="mt-3"><AgentActivityPanel traces={message.traces} isStreaming={message.status === "streaming"} /></div> : null}
                {message.video ? <div className="mt-4"><VideoResultCard video={message.video} /></div> : null}
                {message.cart ? <div className="mt-4"><CartReadyCard cart={message.cart} /></div> : null}

                {message.authUrl ? (
                  <section className="mt-4 rounded-[28px] border border-amber-300/20 bg-amber-500/10 p-5 text-white">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">Kroger Connection Needed</p>
                    <p className="mt-2 text-sm text-white/75">Connect Kroger once, then rerun the same request and I’ll finish the cart.</p>
                    <Link href={message.authUrl} className="mt-4 inline-flex">
                      <Button size="lg" className="rounded-full bg-amber-300 px-6 text-slate-950 hover:bg-amber-200">
                        Connect Kroger
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </section>
                ) : null}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,10,18,0),rgba(8,10,18,0.82)_24%,rgba(8,10,18,0.98))] pt-3">
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,31,0.68),rgba(10,13,22,0.88))] px-3 py-3 shadow-[0_20px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
              <ChatInput onSubmit={submitPrompt} isLoading={isSending} placeholder="Ask for a recipe, groceries, or both" />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function makeUserMessage(content: string): UiMessage {
  return {
    id: makeMessageId(),
    role: "user",
    content,
    status: "idle",
    traces: [],
    video: null,
    cart: null,
    authUrl: null,
    error: null,
  }
}

function makeAssistantPlaceholder(): UiMessage {
  return {
    id: makeMessageId(),
    role: "assistant",
    content: "",
    status: "streaming",
    traces: [],
    video: null,
    cart: null,
    authUrl: null,
    error: null,
  }
}

function toChatHistory(messages: UiMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function parseSseEvent(block: string): AgentStreamEvent | null {
  const lines = block.split(/\r?\n/)
  let eventName = ""
  let data = ""

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim()
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim()
    }
  }

  if (!eventName || !data) {
    return null
  }

  try {
    return JSON.parse(data) as AgentStreamEvent
  } catch {
    return null
  }
}

function deriveVideoArtifact(trace: ToolTraceEntry): VideoArtifact | null {
  if (trace.name !== "get_video_context" || !trace.output || typeof trace.output !== "object") {
    return null
  }

  const output = trace.output as Record<string, unknown>
  const video = output.video as Record<string, unknown> | undefined
  if (!video || typeof video.title !== "string" || typeof video.url !== "string" || typeof video.channel !== "string") {
    return null
  }

  const recipeSource =
    output.recipeSource === "youtube_transcript" || output.recipeSource === "fallback_recipe" || output.recipeSource === "none"
      ? output.recipeSource
      : "none"

  return {
    kind: "video",
    video: {
      title: video.title,
      url: video.url,
      channel: video.channel,
    },
    transcriptAvailable: Boolean(output.transcriptAvailable),
    recipeSource,
    summary:
      typeof output.recipeText === "string"
        ? output.recipeText.slice(0, 280)
        : typeof output.transcript === "string"
          ? output.transcript.slice(0, 280)
          : typeof output.transcriptMessage === "string"
            ? output.transcriptMessage
            : trace.summary,
  }
}

function makeMessageId() {
  return crypto.randomUUID()
}

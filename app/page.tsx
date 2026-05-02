"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ChevronRight,
  Flame,
  Loader2,
  Menu,
  Play,
  ShoppingCart,
  Sparkles,
} from "lucide-react"
import { AgentActivityPanel } from "@/components/AgentActivityPanel"
import { CartReadyCard } from "@/components/CartReadyCard"
import { ChatInput } from "@/components/ChatInput"
import { ChatMarkdown } from "@/components/ChatMarkdown"
import { VideoResultCard } from "@/components/VideoResultCard"
import { Button } from "@/components/ui/button"
import { LoginScreen } from "@/components/LoginScreen"
import { Sidebar, type ChatSession } from "@/components/Sidebar"
import { KrogerConnectButton } from "@/components/KrogerConnectButton"
import { cn } from "@/lib/utils"
import { WelcomeHero } from "@/components/WelcomeHero"
import type { AgentStreamEvent, CartArtifact, ChatMessage, ToolTraceEntry, VideoArtifact } from "@/lib/types"
import type { AuthUserDto } from "@/components/LoginScreen"

const EXAMPLES = [
  { icon: Flame, text: "I'm craving an American cheeseburger" },
  { icon: ShoppingCart, text: "Buy milk" },
  { icon: Play, text: "Tell me about a chicken Alfredo video" },
  { icon: Sparkles, text: "Find a good chicken alfredo video and buy the groceries" },
] as const

const FEATURE_PILLS = [
  "YouTube search & transcripts",
  "Kroger product matching",
  "Live cart actions",
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

interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  video: VideoArtifact | null
  cart: CartArtifact | null
}

interface User {
  id: string
  name: string
  email: string
}

const HISTORY_SYNC_FLAG = "cravecart_hist_synced_v1"

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [userLoaded, setUserLoaded] = useState(false)
  const [krogerConnected, setKrogerConnected] = useState(false)
  const [krogerIsMock, setKrogerIsMock] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const latestMessagesRef = useRef<UiMessage[]>([])
  const sessionsRef = useRef<ChatSession[]>([])
  /** Stable sidebar titles — AI-named for new chats, or loaded from Firestore */
  const resolvedChatTitleRef = useRef<Map<string, string>>(new Map())
  const aiTitleRequestedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  async function refreshKrogerFromServer() {
    try {
      const pending = localStorage.getItem("cravecart_kroger_pending")
      if (pending) {
        localStorage.removeItem("cravecart_kroger_pending")
        localStorage.setItem("cravecart_kroger_connected", "1")
      }

      const r = await fetch("/api/kroger/status", { credentials: "same-origin" })
      if (!r.ok) return
      const d = (await r.json()) as {
        authenticated?: boolean
        mockMode?: boolean
        needsFirebaseAuth?: boolean
      }
      if (d.needsFirebaseAuth) return

      if (d.mockMode) {
        setKrogerIsMock(true)
        setKrogerConnected(true)
        localStorage.setItem("cravecart_kroger_connected", "1")
        localStorage.setItem("cravecart_kroger_mock", "1")
        return
      }

      setKrogerIsMock(false)
      if (d.authenticated) {
        setKrogerConnected(true)
        localStorage.setItem("cravecart_kroger_connected", "1")
        localStorage.removeItem("cravecart_kroger_mock")
      } else {
        setKrogerConnected(false)
        localStorage.removeItem("cravecart_kroger_connected")
        localStorage.removeItem("cravecart_kroger_mock")
      }
    } catch {
      // Leave prior UI state on network errors.
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" })
        const meData = (await meRes.json()) as { user: User | null }
        const authedUser = meData.user
        if (authedUser) {
          setUser(authedUser)
          await loadSessionsForUser(authedUser.id)
          await migrateLocalHistoryIfNeeded()
          await refreshKrogerFromServer()
        }
      } catch {
        // stay logged out — LoginScreen gates the app
      } finally {
        setUserLoaded(true)
      }
    })()
  }, [])

  async function loadSessionsForUser(_userId: string) {
    try {
      const r = await fetch("/api/chat-sessions", { credentials: "same-origin" })
      if (!r.ok) return
      const data = (await r.json()) as { sessions?: ChatSession[] }
      const list = data.sessions ?? []
      for (const s of list) {
        if (s.title) resolvedChatTitleRef.current.set(s.id, s.title)
      }
      setSessions(list)

      const last = sessionStorage.getItem("cravecart_active_session")
      if (last && list.some((s) => s.id === last)) {
        handleSelectSessionFromServer(last)
      }
    } catch {
      // ignore
    }
  }

  async function migrateLocalHistoryIfNeeded() {
    if (localStorage.getItem(HISTORY_SYNC_FLAG)) return
    let localList: ChatSession[] = []
    try {
      const rawSessions = localStorage.getItem("cravecart_sessions")
      if (!rawSessions) return
      localList = JSON.parse(rawSessions) as ChatSession[]
      if (!Array.isArray(localList) || localList.length === 0) return
    } catch {
      return
    }

    try {
      const check = await fetch("/api/chat-sessions", { credentials: "same-origin" })
      if (!check.ok) return
      const existing = ((await check.json()) as { sessions?: ChatSession[] }).sessions ?? []
      if (existing.length > 0) {
        localStorage.setItem(HISTORY_SYNC_FLAG, "1")
        return
      }
    } catch {
      return
    }

    const messagesBySession: Record<string, StoredMessage[]> = {}
    for (const s of localList) {
      try {
        const raw = localStorage.getItem(`cravecart_session_${s.id}`)
        if (raw) messagesBySession[s.id] = JSON.parse(raw) as StoredMessage[]
      } catch {}
    }

    try {
      const ir = await fetch("/api/chat-sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: localList, messagesBySession }),
      })
      if (ir.ok) {
        localStorage.setItem(HISTORY_SYNC_FLAG, "1")
        setSessions(localList)
      }
    } catch {}
  }

  async function handleSelectSessionFromServer(id: string) {
    const meta = sessions.find((s) => s.id === id)
    if (meta?.title) resolvedChatTitleRef.current.set(id, meta.title)

    setActiveSessionId(id)
    setSidebarOpen(false)
    sessionStorage.setItem("cravecart_active_session", id)
    try {
      const r = await fetch(`/api/chat-sessions/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      })
      if (!r.ok) {
        try {
          const rawLs = localStorage.getItem(`cravecart_session_${id}`)
          if (!rawLs) return
          const stored = JSON.parse(rawLs) as StoredMessage[]
          const restoredLs: UiMessage[] = stored.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            status: "idle",
            traces: [],
            video: m.video as VideoArtifact | null,
            cart: m.cart as CartArtifact | null,
            authUrl: null,
            error: null,
          }))
          setMessages(restoredLs)
          latestMessagesRef.current = restoredLs
        } catch {}
        return
      }
      const data = (await r.json()) as { messages?: StoredMessage[] }
      const rows = data.messages ?? []
      const restored: UiMessage[] = rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: "idle",
        traces: [],
        video: m.video as VideoArtifact | null,
        cart: m.cart as CartArtifact | null,
        authUrl: null,
        error: null,
      }))
      setMessages(restored)
      latestMessagesRef.current = restored
    } catch {}
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: messages.length > 0 ? "smooth" : "auto",
    })
  }, [messages])

  function updateMessages(updater: (prev: UiMessage[]) => UiMessage[]) {
    setMessages((prev) => {
      const next = updater(prev)
      latestMessagesRef.current = next
      return next
    })
  }

  function handleAuthed(next: AuthUserDto) {
    setUser({ id: next.id, name: next.name, email: next.email })
    void loadSessionsForUser(next.id)
    void migrateLocalHistoryIfNeeded()
    void refreshKrogerFromServer()
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
    } catch {
      // still clear client
    }
    setUser(null)
    setSessions([])
    setActiveSessionId(null)
    setMessages([])
    latestMessagesRef.current = []
    sessionStorage.removeItem("cravecart_active_session")
  }

  function handleKrogerConnected() {
    setKrogerConnected(true)
    localStorage.setItem("cravecart_kroger_connected", "1")
    void refreshKrogerFromServer()
  }

  async function handleKrogerDisconnected() {
    await fetch("/api/kroger/disconnect", {
      method: "POST",
      credentials: "same-origin",
    })
    setKrogerConnected(false)
    setKrogerIsMock(false)
    localStorage.removeItem("cravecart_kroger_connected")
    localStorage.removeItem("cravecart_kroger_mock")
    localStorage.removeItem("cravecart_kroger_pending")
  }

  function handleNewChat() {
    setMessages([])
    latestMessagesRef.current = []
    setActiveSessionId(null)
    sessionStorage.removeItem("cravecart_active_session")
    setSidebarOpen(false)
  }

  function handleSelectSession(id: string) {
    void handleSelectSessionFromServer(id)
  }

  function persistSession(sessionId: string, title: string, msgs: UiMessage[]) {
    const stored: StoredMessage[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      video: m.video,
      cart: m.cart,
    }))
    localStorage.setItem(`cravecart_session_${sessionId}`, JSON.stringify(stored))

    setSessions((prev) => {
      const exists = prev.some((s) => s.id === sessionId)
      const updated: ChatSession[] = exists
        ? prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        : [{ id: sessionId, title, createdAt: Date.now() }, ...prev].slice(0, 20)
      localStorage.setItem("cravecart_sessions", JSON.stringify(updated))
      return updated
    })

    void fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, messages: stored }),
    }).catch(() => {})
  }

  async function submitPrompt(prompt: string) {
    if (isSending || !krogerConnected) return

    const isFirstUserTurn = messages.length === 0

    const userMessage = makeUserMessage(prompt)
    const assistantMessage = makeAssistantPlaceholder()
    const historyForRequest = [...messages, userMessage]

    const sessionId = activeSessionId ?? crypto.randomUUID()
    if (!activeSessionId) {
      setActiveSessionId(sessionId)
      sessionStorage.setItem("cravecart_active_session", sessionId)
    }

    updateMessages(() => [...historyForRequest, assistantMessage])
    setIsSending(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toChatHistory(historyForRequest) }),
      })

      if (response.status === 401) {
        setUser(null)
        throw new Error("Sign in again to continue chatting.")
      }

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

      const titleForSave = (() => {
        const fromRef = resolvedChatTitleRef.current.get(sessionId)
        if (fromRef) return fromRef
        const fromSidebar = sessionsRef.current.find((s) => s.id === sessionId)?.title
        if (fromSidebar) return fromSidebar
        return isFirstUserTurn ? "New chat" : prompt.length > 48 ? `${prompt.slice(0, 45)}…` : prompt
      })()

      persistSession(sessionId, titleForSave, latestMessagesRef.current)

      if (isFirstUserTurn && !aiTitleRequestedRef.current.has(sessionId)) {
        aiTitleRequestedRef.current.add(sessionId)
        void (async () => {
          try {
            const tr = await fetch("/api/chat/session-title", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ firstMessage: prompt }),
            })
            if (!tr.ok) return
            const body = (await tr.json()) as { title?: string }
            const nextTitle = body.title?.trim()
            if (!nextTitle) return
            resolvedChatTitleRef.current.set(sessionId, nextTitle)
            setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: nextTitle } : s)))
            persistSession(sessionId, nextTitle, latestMessagesRef.current)
          } catch {
            aiTitleRequestedRef.current.delete(sessionId)
          }
        })()
      }
    }
  }

  async function consumeEventStream(body: ReadableStream<Uint8Array>, assistantId: string) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf("\n\n")

      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")
        const parsed = parseSseEvent(chunk)
        if (parsed) applyAgentEvent(assistantId, parsed)
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
        updateAssistantMessage(assistantId, (c) => ({ ...c, content: `${c.content}${event.delta}` }))
        break
      case "tool_call_started":
      case "tool_call_finished":
        updateAssistantMessage(assistantId, (c) => {
          const nextVideo =
            event.type === "tool_call_finished"
              ? (deriveVideoArtifact(event.trace) ?? c.video)
              : c.video
          return { ...c, traces: [...c.traces, event.trace], video: nextVideo }
        })
        break
      case "needs_kroger_auth":
        updateAssistantMessage(assistantId, (c) => ({
          ...c,
          status: "idle",
          authUrl: event.authUrl,
          traces: event.activity,
          video: event.artifact ?? c.video,
        }))
        break
      case "cart_ready":
        updateAssistantMessage(assistantId, (c) => ({
          ...c,
          status: "idle",
          cart: event.cart,
          traces: event.activity,
        }))
        break
      case "error":
        updateAssistantMessage(assistantId, (c) => ({
          ...c,
          status: "error",
          error: event.message,
          content: c.content || event.message,
        }))
        break
    }
  }

  function updateAssistantMessage(messageId: string, updater: (message: UiMessage) => UiMessage) {
    updateMessages((current) =>
      current.map((m) => (m.id === messageId ? updater(m) : m))
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!userLoaded) return null

  if (!user) return <LoginScreen onAuthed={handleAuthed} />

  const firstName = user.name.split(" ")[0]

  return (
    <div className="relative z-10 flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        userName={user.name}
        userEmail={user.email}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* ── Header ── */}
        <header className="flex items-center gap-3 border-b border-white/[0.07] bg-[oklch(0.13_0.02_248/0.5)] px-4 py-2.5 backdrop-blur-sm">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/6 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50 md:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile brand */}
          <div className="flex flex-1 items-center gap-2 md:hidden">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-primary/30 bg-primary/15">
              <ShoppingCart className="h-3 w-3 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-white">CraveCart</span>
          </div>

          {/* Desktop: model/context indicator */}
          <div className="hidden flex-1 items-center gap-2 md:flex">
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] text-white/35">
              Gemini 2.5 Flash · Kroger + YouTube
            </span>
          </div>

          {/* Kroger button */}
          <KrogerConnectButton
            isConnected={krogerConnected}
            isMock={krogerIsMock}
            onConnected={handleKrogerConnected}
            onDisconnected={handleKrogerDisconnected}
          />
        </header>

        {/* ── Chat area ── */}
        <main className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4 md:px-8">
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
            <section className="flex min-h-0 flex-1 flex-col">

              {/* Messages */}
              <div
                ref={messagesViewportRef}
                className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1"
              >
                {/* Welcome screen */}
                {messages.length === 0 && (
                  <div className="flex min-h-full flex-col gap-4 pb-2">
                    {/* Cinematic hero fill — tagline + food floaters + category chips */}
                    <div className="flex min-h-0 flex-1 items-center justify-center py-2">
                      <WelcomeHero
                        onSelectCategory={submitPrompt}
                        krogerConnected={krogerConnected}
                      />
                    </div>
                    <article className="w-full">

                      {/* Hero card */}
                      <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[oklch(0.15_0.02_248/0.6)] px-6 py-6 backdrop-blur-xl">
                        {/* Top gradient line */}
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />

                        <div className="flex items-start gap-4">
                          <div className="relative mt-0.5 shrink-0">
                            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md" />
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/8">
                              <ShoppingCart className="h-5 w-5 text-primary" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                              CraveCart · AI Agent
                            </p>
                            <h1 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-white md:text-[1.65rem]">
                              Hey {firstName}, what are you craving?
                            </h1>
                            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
                              Tell me a dish, a video, or just "buy groceries" — I'll handle the rest
                              across YouTube and Kroger in real time.
                            </p>
                          </div>
                        </div>

                        {/* Feature pills */}
                        <div className="mt-5 flex flex-wrap gap-2">
                          {FEATURE_PILLS.map((pill) => (
                            <span
                              key={pill}
                              className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-[11px] text-white/45"
                            >
                              {pill}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Kroger gate notice */}
                      {!krogerConnected && (
                        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-400/18 bg-amber-400/7 px-4 py-3">
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
                          <p className="text-[13px] text-amber-200/75">
                            Use the{" "}
                            <span className="font-medium text-amber-200">Connect Kroger</span>{" "}
                            button above to link your account before chatting.
                          </p>
                        </div>
                      )}

                      {/* Suggestion chips */}
                      {krogerConnected && (
                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {EXAMPLES.map(({ icon: Icon, text }) => (
                            <button
                              key={text}
                              type="button"
                              onClick={() => submitPrompt(text)}
                              className={cn(
                                "group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3",
                                "text-left text-[13px] text-white/60 transition-all duration-150",
                                "hover:border-primary/30 hover:bg-primary/[0.08] hover:text-white/90",
                                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50"
                              )}
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5 transition-colors group-hover:border-primary/25 group-hover:bg-primary/10">
                                <Icon className="h-3.5 w-3.5 text-white/45 transition-colors group-hover:text-primary/80" />
                              </span>
                              <span className="leading-snug">{text}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  </div>
                )}

                {/* Message thread */}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={message.role === "user" ? "ml-auto max-w-xl" : "mr-auto w-full max-w-full"}
                  >
                    <div
                      className={
                        message.role === "user"
                          ? "rounded-[22px] border border-primary/16 bg-gradient-to-br from-primary/14 to-primary/8 px-5 py-3.5 text-white shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
                          : "rounded-[24px] border border-white/[0.08] bg-[oklch(0.15_0.02_248/0.55)] px-5 py-4 text-white backdrop-blur-lg"
                      }
                    >
                      <p
                        className={cn(
                          "text-[10px] uppercase tracking-[0.22em]",
                          message.role === "user" ? "text-primary/70" : "text-white/35"
                        )}
                      >
                        {message.role === "user" ? "You" : "CraveCart"}
                      </p>
                      <div className="mt-2.5">
                        {message.content ? (
                          <ChatMarkdown
                            content={message.content.trim()}
                            tone={message.role === "assistant" ? "assistant" : "user"}
                          />
                        ) : null}
                        {message.status === "streaming" && !message.content ? (
                          <div className="flex items-center gap-2.5 text-white/55">
                            <Loader2 className="h-4 w-4 animate-spin text-primary/70" />
                            <span className="text-[14px]">Working across YouTube and Kroger…</span>
                          </div>
                        ) : null}
                        {message.error ? (
                          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-rose-300/12 bg-rose-500/8 px-4 py-3 text-[13px] text-rose-200">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                            <span>{message.error}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {message.role === "assistant" && (
                      <div className="mt-2.5">
                        <AgentActivityPanel
                          traces={message.traces}
                          isStreaming={message.status === "streaming"}
                        />
                      </div>
                    )}
                    {message.video && (
                      <div className="mt-4">
                        <VideoResultCard video={message.video} />
                      </div>
                    )}
                    {message.cart && (
                      <div className="mt-4">
                        <CartReadyCard cart={message.cart} />
                      </div>
                    )}

                    {message.authUrl && (
                      <section className="mt-4 rounded-[24px] border border-amber-300/18 bg-amber-500/8 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                          Kroger Connection Needed
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                          Connect Kroger once, then rerun the same request and I'll finish the cart.
                        </p>
                        <Link href={message.authUrl} className="mt-4 inline-flex">
                          <Button
                            size="lg"
                            className="rounded-full bg-amber-300 px-6 text-sm text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-200"
                          >
                            Connect Kroger
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </section>
                    )}
                  </article>
                ))}

                <div ref={messagesEndRef} />
              </div>

              {/* ── Input bar ── */}
              {krogerConnected ? (
                <div className="border-t border-white/[0.07] bg-gradient-to-t from-[oklch(0.12_0.02_248/0.98)] via-[oklch(0.12_0.02_248/0.85)] to-transparent pt-3">
                  <ChatInput
                    onSubmit={submitPrompt}
                    isLoading={isSending}
                    placeholder="Ask for a recipe, groceries, or both…"
                  />
                </div>
              ) : (
                <div className="border-t border-white/[0.07] pt-3">
                  <div
                    className="flex items-center justify-center gap-2.5 rounded-2xl border border-amber-400/15 bg-amber-400/5 px-5 py-3.5"
                    role="status"
                    aria-label="Connect Kroger to enable chat"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
                    <p className="text-[13px] text-amber-200/65">
                      Connect Kroger above to start chatting
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUserMessage(content: string): UiMessage {
  return { id: makeMessageId(), role: "user", content, status: "idle", traces: [], video: null, cart: null, authUrl: null, error: null }
}

function makeAssistantPlaceholder(): UiMessage {
  return { id: makeMessageId(), role: "assistant", content: "", status: "streaming", traces: [], video: null, cart: null, authUrl: null, error: null }
}

function toChatHistory(messages: UiMessage[]): ChatMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

function parseSseEvent(block: string): AgentStreamEvent | null {
  const lines = block.split(/\r?\n/)
  let eventName = ""
  let data = ""
  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim()
    if (line.startsWith("data:")) data += line.slice(5).trim()
  }
  if (!eventName || !data) return null
  try {
    return JSON.parse(data) as AgentStreamEvent
  } catch {
    return null
  }
}

function deriveVideoArtifact(trace: ToolTraceEntry): VideoArtifact | null {
  if (trace.name !== "get_video_context" || !trace.output || typeof trace.output !== "object") return null
  const output = trace.output as Record<string, unknown>
  const video = output.video as Record<string, unknown> | undefined
  if (!video || typeof video.title !== "string" || typeof video.url !== "string" || typeof video.channel !== "string") return null
  const recipeSource =
    output.recipeSource === "youtube_transcript" || output.recipeSource === "fallback_recipe" || output.recipeSource === "none"
      ? output.recipeSource : "none"
  return {
    kind: "video",
    video: { title: video.title, url: video.url, channel: video.channel },
    transcriptAvailable: Boolean(output.transcriptAvailable),
    recipeSource,
    summary:
      typeof output.recipeText === "string" ? output.recipeText.slice(0, 280)
      : typeof output.transcript === "string" ? output.transcript.slice(0, 280)
      : typeof output.transcriptMessage === "string" ? output.transcriptMessage
      : trace.summary,
  }
}

function makeMessageId() {
  return crypto.randomUUID()
}

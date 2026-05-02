"use client"

import { useState } from "react"
import { LogOut, MessageSquare, Plus, Search, ShoppingCart, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ChatSession {
  id: string
  title: string
  createdAt: number
}

type DateGroup = "Today" | "Yesterday" | "Last 7 days" | "Older"

interface SidebarProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewChat: () => void
  userName: string
  userEmail: string
  onLogout: () => void
  isOpen: boolean
  onClose: () => void
}

function getDateGroup(ts: number): DateGroup {
  const ms = Date.now() - ts
  const DAY = 86_400_000
  if (ms < DAY) return "Today"
  if (ms < 2 * DAY) return "Yesterday"
  if (ms < 7 * DAY) return "Last 7 days"
  return "Older"
}

const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "Last 7 days", "Older"]

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  userName,
  userEmail,
  onLogout,
  isOpen,
  onClose,
}: SidebarProps) {
  const [search, setSearch] = useState("")

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const filtered = search.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions

  const grouped = GROUP_ORDER.reduce<Record<DateGroup, ChatSession[]>>(
    (acc, g) => {
      acc[g] = filtered.filter((s) => getDateGroup(s.createdAt) === g)
      return acc
    },
    { Today: [], Yesterday: [], "Last 7 days": [], Older: [] }
  )

  const hasAny = filtered.length > 0

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/65 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col",
          "border-r border-white/[0.07] bg-[oklch(0.12_0.018_248/0.92)] backdrop-blur-xl",
          "transition-transform duration-300 ease-in-out",
          "md:relative md:inset-auto md:z-auto md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Navigation sidebar"
      >
        {/* Logo row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-7 w-7 items-center justify-center">
              <div className="absolute inset-0 rounded-lg bg-primary/20 blur-sm" />
              <div className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/8">
                <ShoppingCart className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">CraveCart</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/6 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 pb-2">
          <button
            onClick={onNewChat}
            className={cn(
              "group interactive-shimmer flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.04]",
              "px-3 py-2.5 text-sm text-white/60 transition-all duration-150",
              "hover:border-primary/25 hover:bg-primary/8 hover:text-white",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50"
            )}
          >
            <Plus className="h-4 w-4 transition-transform duration-150 group-hover:rotate-90" />
            New chat
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/28" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className={cn(
                "w-full rounded-xl border border-white/8 bg-white/[0.04] py-2 pl-8 pr-3",
                "text-[13px] text-white placeholder:text-white/25",
                "transition-colors focus:border-white/16 focus:bg-white/6 focus:outline-none"
              )}
            />
          </div>
        </div>

        {/* Chat history */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Chat history">
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-white/15" />
              <p className="mt-2 text-[12px] text-white/25">No conversations yet</p>
            </div>
          ) : !hasAny ? (
            <p className="px-3 py-4 text-center text-[12px] text-white/28">No matches for "{search}"</p>
          ) : (
            <div className="space-y-3">
              {GROUP_ORDER.map((group) => {
                const items = grouped[group]
                if (items.length === 0) return null
                return (
                  <div key={group}>
                    <p className="px-3 pb-1 pt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/25">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((session) => {
                        const isActive = session.id === activeSessionId
                        return (
                          <button
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "group interactive-shimmer relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px]",
                              "border-l-2 transition-all duration-150",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50",
                              isActive
                                ? "border-primary/60 bg-primary/10 text-white"
                                : "border-transparent text-white/48 hover:border-white/15 hover:bg-white/[0.05] hover:text-white/80"
                            )}
                          >
                            <MessageSquare
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-colors",
                                isActive ? "text-primary/70" : "text-white/30 group-hover:text-white/50"
                              )}
                            />
                            <span className="truncate">{session.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </nav>

        {/* Divider */}
        <div className="mx-3 border-t border-white/[0.07]" />

        {/* User profile block */}
        <div className="p-3">
          <div className="group interactive-shimmer flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.05]">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/15 text-[12px] font-bold text-primary shadow-inner shadow-primary/10 ring-1 ring-primary/20">
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-[1.5px] border-[oklch(0.12_0.018_248)] bg-green-500" />
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{userName}</p>
              {userEmail && (
                <p className="truncate text-[11px] text-white/35">{userEmail}</p>
              )}
            </div>

            {/* Action icons */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={onLogout}
                className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/8 hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

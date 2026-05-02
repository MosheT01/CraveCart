"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MAX_CHARS = 1000

interface ChatInputProps {
  onSubmit: (craving: string) => void
  isLoading?: boolean
  placeholder?: string
  className?: string
}

export function ChatInput({
  onSubmit,
  isLoading = false,
  placeholder = "What are you craving?",
  className,
}: ChatInputProps) {
  const [value, setValue] = useState("")

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextValue = value.trim()
    if (!nextValue || isLoading) return
    onSubmit(nextValue)
    setValue("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  const charCount = value.length
  const nearLimit = charCount > MAX_CHARS * 0.8
  const overLimit = charCount > MAX_CHARS

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "rounded-[22px] border bg-black/40 px-1 pt-1 pb-1 shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-200",
          "focus-within:shadow-[0_8px_40px_rgba(0,0,0,0.35)]",
          overLimit
            ? "border-rose-500/30 focus-within:border-rose-500/50"
            : "border-white/10 focus-within:border-white/18"
        )}
      >
        <div className="flex items-end gap-2 px-1">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            maxLength={MAX_CHARS + 100}
            className="max-h-32 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-white placeholder:text-white/38 focus-visible:ring-0"
          />

          <div className="flex shrink-0 items-end gap-1.5 pb-1 pr-0.5">
            {/* Character count — only shown when typing */}
            {charCount > 0 && (
              <span
                className={cn(
                  "mb-1.5 text-[10px] tabular-nums transition-colors duration-200",
                  overLimit ? "text-rose-400" : nearLimit ? "text-amber-400/70" : "text-white/22"
                )}
              >
                {charCount}
              </span>
            )}

            <Button
              type="submit"
              size="icon"
              disabled={!value.trim() || isLoading || overLimit}
              className={cn(
                "h-9 w-9 rounded-full shadow-lg transition-all duration-200",
                "hover:scale-[1.06] active:scale-95",
                value.trim() && !overLimit
                  ? "bg-primary text-primary-foreground shadow-primary/30 hover:bg-primary/90 hover:shadow-primary/40"
                  : "bg-white/8 text-white/30 shadow-none"
              )}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Bottom hint */}
        <div className="px-3 pb-1.5 pt-0">
          <p className="text-[10px] text-white/18">
            Press <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </form>
  )
}

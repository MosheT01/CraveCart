"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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

    if (!nextValue || isLoading) {
      return
    }

    onSubmit(nextValue)
    setValue("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <div className="rounded-[22px] border border-white/12 bg-black/35 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className="max-h-24 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] text-white placeholder:text-white/45 focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!value.trim() || isLoading}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] hover:bg-primary/90"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  )
}

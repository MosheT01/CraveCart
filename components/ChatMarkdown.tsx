import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface ChatMarkdownProps {
  content: string
  tone?: "assistant" | "user"
}

function normalizeAssistantMarkdown(content: string) {
  if (!content.trim()) return content

  return content
    .replace(/\s*\*\*Ingredients:\s*\*?/gi, "\n\n### Ingredients\n\n")
    .replace(/\s*\*\*Instructions:\s*\*?/gi, "\n\n### Instructions\n\n")
    .replace(/\s+(Ingredients|Instructions|Directions|Method):\s*/gi, "\n\n### $1\n\n")
    .replace(/\s+###\s+Cart verification\b/gi, "\n\n### Cart verification\n\n")
    .replace(/(^|\s)\*\s+/g, "$1\n- ")
    .replace(/\s+-\s+(?=\*\*)/g, "\n- ")
    .replace(/\s+(?=\d+\.\s+[A-Z])/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function ChatMarkdown({ content, tone = "assistant" }: ChatMarkdownProps) {
  const renderedContent = tone === "assistant" ? normalizeAssistantMarkdown(content) : content

  return (
    <div
      className={cn(
        "max-w-none text-[15px] leading-7",
        tone === "assistant" ? "text-white/88" : "text-white",
        "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4",
        tone === "assistant" ? "[&_a]:text-primary" : "[&_a]:text-white",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic",
        tone === "assistant" ? "[&_blockquote]:border-white/18 [&_blockquote]:text-white/68" : "[&_blockquote]:border-primary/35 [&_blockquote]:text-white/85",
        "[&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]",
        tone === "assistant" ? "[&_code]:bg-white/8" : "[&_code]:bg-black/18",
        "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
        "[&_h3]:text-lg [&_h3]:font-semibold",
        "[&_hr]:border-white/10",
        "[&_li]:marker:text-white/50",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_p]:my-0",
        "[&_p+p]:mt-4",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm",
        tone === "assistant" ? "[&_pre]:bg-black/22" : "[&_pre]:bg-black/18",
        "[&_strong]:font-semibold [&_strong]:text-white",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          p: ({ node: _node, ...props }) => <p {...props} />,
          ul: ({ node: _node, ...props }) => <ul {...props} />,
          ol: ({ node: _node, ...props }) => <ol {...props} />,
          li: ({ node: _node, ...props }) => <li className="pl-1" {...props} />,
          code: ({ node: _node, className, children, ...props }) => (
            <code className={className} {...props}>
              {children}
            </code>
          ),
          pre: ({ node: _node, ...props }) => <pre {...props} />,
        }}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  )
}

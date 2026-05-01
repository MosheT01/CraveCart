import { ExternalLink, PlayCircle } from "lucide-react"
import type { VideoArtifact } from "@/lib/types"

interface VideoResultCardProps {
  video: VideoArtifact
}

export function VideoResultCard({ video }: VideoResultCardProps) {
  return (
    <section className="rounded-[28px] border border-white/12 bg-white/[0.06] px-5 py-4 text-white backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.24em] text-primary/80">
        <PlayCircle className="h-4 w-4" />
        Video Context
      </div>
      <a
        href={video.video.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-lg font-semibold text-white hover:text-primary"
      >
        {video.video.title}
        <ExternalLink className="h-4 w-4" />
      </a>
      <p className="mt-1 text-sm text-white/65">{video.video.channel}</p>
      <p className="mt-4 text-sm leading-7 text-white/80">{video.summary}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-white/45">
        {video.transcriptAvailable ? "Transcript available" : "Transcript unavailable"} · source {video.recipeSource.replace("_", " ")}
      </p>
    </section>
  )
}

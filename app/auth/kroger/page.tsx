import { KrogerAuthClient } from "@/components/KrogerAuthClient"

export default function KrogerAuthPage({
  searchParams,
}: {
  searchParams?: {
    status?: string
    message?: string
  }
}) {
  const initialState =
    searchParams?.status === "connected"
      ? { mode: "connected" as const }
      : searchParams?.status === "error"
        ? {
            mode: "error" as const,
            message: searchParams.message ?? "Kroger authorization failed.",
          }
        : { mode: "loading" as const }

  return <KrogerAuthClient initialState={initialState} />
}

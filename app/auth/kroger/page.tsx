import { KrogerAuthClient } from "@/components/KrogerAuthClient"

type KrogerAuthSearchParams = {
  status?: string
  message?: string
}

export default async function KrogerAuthPage({
  searchParams,
}: {
  /** Next.js 15+ may pass a Promise; support both. */
  searchParams?: Promise<KrogerAuthSearchParams> | KrogerAuthSearchParams
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {}

  const initialState =
    sp.status === "connected"
      ? { mode: "connected" as const }
      : sp.status === "error"
        ? {
            mode: "error" as const,
            message: sp.message ?? "Kroger authorization failed.",
          }
        : { mode: "loading" as const }

  return <KrogerAuthClient initialState={initialState} />
}

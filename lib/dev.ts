export function devLog(step: string, payload?: unknown): void {
  if (process.env.NODE_ENV !== "development") {
    return
  }

  if (payload === undefined) {
    console.log(`[cravecart] ${step}`)
    return
  }

  console.log(`[cravecart] ${step}`, payload)
}

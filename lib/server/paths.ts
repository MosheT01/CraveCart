import path from "node:path"

export function getDataDir(): string {
  return process.env.CRAVECART_DATA_DIR?.trim() || path.join(process.cwd(), ".data")
}

import type { Envelope } from '@shared/api'

declare global {
  interface Window {
    api: {
      invoke(method: string, input: unknown): Promise<Envelope>
      getPathForFile(file: File): string
    }
  }
}
export {}

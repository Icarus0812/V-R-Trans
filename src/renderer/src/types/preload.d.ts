export {}

declare global {
  interface Window {
    whisperApi: {
      transcribeBuffer: (arrayBuffer: ArrayBuffer) => Promise<{
        ok: boolean
        text?: string
        segments?: unknown[]
        error?: string
      }>
    }
  }
}

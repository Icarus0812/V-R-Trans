import type { ElectronAPI } from '@electron-toolkit/preload'

type WhisperSegment = {
  start: number
  end: number
  text: string
}

type WhisperTranscribeResponse = {
  ok?: boolean
  error?: string
  text?: string
  full_text?: string
  english_pivot_text?: string
  segments?: WhisperSegment[]
  translated_segments?: WhisperSegment[]
  detected_language?: string
  language_probability?: number
  whisper_model?: string
  available_whisper_models?: string[]
  translation_model?: string
}

type WhisperModelOptionsResponse = {
  ok: boolean
  defaultModel?: string
  models?: string[]
  error?: string
}

interface WhisperApi {
  transcribeBuffer: (
    arrayBuffer: ArrayBuffer,
    inputLanguage: string,
    whisperModel?: string
  ) => Promise<WhisperTranscribeResponse>

  getModelOptions: () => Promise<WhisperModelOptionsResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    whisperApi: WhisperApi
  }
}

export {}

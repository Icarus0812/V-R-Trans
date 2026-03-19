// Window.whisperApi 전역 타입 선언

type WhisperSegment = {
  start: number
  end: number
  text: string
}

interface WhisperTranscribePayload {
  arrayBuffer: ArrayBuffer
  inputLanguage?: string
  whisperModel?: string
  translationModel?: string
}

interface WhisperTranscribeResult {
  ok: boolean
  text?: string
  full_text?: string
  english_pivot_text?: string
  segments?: WhisperSegment[]
  translated_segments?: WhisperSegment[]
  detected_language?: string
  language_probability?: number
  whisper_model?: string
  translation_model?: string
  error?: string
}

interface WhisperModelOptions {
  ok: boolean
  defaultModel: string
  models: string[]
  defaultTranslationModel?: string
  translationModels?: string[]
  error?: string
}

interface WhisperApi {
  getModelOptions: () => Promise<WhisperModelOptions>
  transcribeBuffer: (payload: WhisperTranscribePayload) => Promise<WhisperTranscribeResult>
}

declare global {
  interface Window {
    whisperApi: WhisperApi
  }
}

export {}

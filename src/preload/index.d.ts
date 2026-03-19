import { ElectronAPI } from '@electron-toolkit/preload'

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

type WhisperTranscribePayload = {
  arrayBuffer: ArrayBuffer
  inputLanguage?: string
  whisperModel?: string
  translationModel?: string
}

type WhisperModelOptionsResponse = {
  ok: boolean
  defaultModel?: string
  models?: string[]
  defaultTranslationModel?: string
  translationModels?: string[]
  error?: string
}

type DownloadProgressData = {
  type: string
  desc?: string
  n?: number
  total?: number
  percent?: number
  stage?: string
  model?: string
  status?: string
}

interface WhisperApi {
  getModelOptions: () => Promise<WhisperModelOptionsResponse>
  transcribeBuffer: (payload: WhisperTranscribePayload) => Promise<WhisperTranscribeResponse>
  // 다운로드 진행률 구독, 반환값은 구독 해제 함수
  onDownloadProgress: (callback: (data: DownloadProgressData) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    whisperApi: WhisperApi
  }
}

export {}

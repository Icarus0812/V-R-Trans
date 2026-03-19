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

type WhisperModelOptionsResponse = {
  ok: boolean
  defaultModel?: string
  models?: string[]
  error?: string
}

interface WhisperApi {
  /**
   * 오디오 버퍼 전사 요청
   * @param arrayBuffer 녹음된 오디오 데이터
   * @param inputLanguage 입력 언어
   * @param whisperModel 사용할 Whisper 모델
   */
  transcribeBuffer: (
    arrayBuffer: ArrayBuffer,
    inputLanguage: string,
    whisperModel?: string
  ) => Promise<WhisperTranscribeResponse>

  /**
   * 선택 가능한 Whisper 모델 목록 조회
   */
  getModelOptions: () => Promise<WhisperModelOptionsResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    whisperApi: WhisperApi
  }
}

export {}

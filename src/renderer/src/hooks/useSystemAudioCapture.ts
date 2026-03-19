import { useRef, useState } from 'react'

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
  translation_model?: string
}

type CaptureResult = {
  originalText: string
  translatedText: string
  response: WhisperTranscribeResponse
}

interface UseSystemAudioCaptureOptions {
  // Whisper 입력 언어
  inputLanguage?: string

  // 사용할 Whisper 모델
  whisperModel?: string

  // 사용할 번역 모델
  translationModel?: string

  // 전사/번역 결과 수신 콜백
  onResult?: (result: CaptureResult) => void

  // 상태 메시지 변경 콜백
  onStatusChange?: (message: string) => void

  // 에러 콜백
  onError?: (message: string) => void
}

interface UseSystemAudioCaptureReturn {
  isCapturing: boolean
  startCapture: () => Promise<void>
  stopCapture: () => void
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function joinSegments(segments?: WhisperSegment[]): string {
  if (!Array.isArray(segments) || segments.length === 0) return ''
  return segments
    .map((s) => normalizeText(s.text))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractOriginalText(result: WhisperTranscribeResponse): string {
  return (
    normalizeText(result.full_text) ||
    joinSegments(result.segments) ||
    normalizeText(result.text) ||
    normalizeText(result.english_pivot_text)
  )
}

function extractTranslatedText(result: WhisperTranscribeResponse): string {
  return joinSegments(result.translated_segments)
}

export function useSystemAudioCapture(
  options?: UseSystemAudioCaptureOptions
): UseSystemAudioCaptureReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const restartTimerRef = useRef<number | null>(null)
  const isCapturingRef = useRef(false)

  const [isCapturing, setIsCapturing] = useState(false)

  function getSupportedMimeType(): string | undefined {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm']
    return candidates.find((t) => MediaRecorder.isTypeSupported(t))
  }

  function clearRestartTimer(): void {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  function cleanupStreams(): void {
    captureStreamRef.current?.getTracks().forEach((t) => t.stop())
    recordStreamRef.current?.getTracks().forEach((t) => t.stop())
    captureStreamRef.current = null
    recordStreamRef.current = null
  }

  function startRecordingCycle(): void {
    const recordStream = recordStreamRef.current
    if (!recordStream || !isCapturingRef.current) return

    const mimeType = getSupportedMimeType()
    const mediaRecorder = mimeType
      ? new MediaRecorder(recordStream, { mimeType })
      : new MediaRecorder(recordStream)

    mediaRecorderRef.current = mediaRecorder
    const chunks: Blob[] = []

    mediaRecorder.ondataavailable = (event: BlobEvent): void => {
      if (!event.data || event.data.size === 0) return
      chunks.push(event.data)
    }

    mediaRecorder.onerror = (): void => {
      console.error('[useSystemAudioCapture] mediaRecorder error')
      options?.onError?.('녹음 중 오류가 발생했습니다.')
    }

    mediaRecorder.onstop = async (): Promise<void> => {
      try {
        const completeBlob = new Blob(chunks, { type: mimeType ?? 'audio/webm' })
        if (completeBlob.size <= 0) return

        const arrayBuffer = await completeBlob.arrayBuffer()
        options?.onStatusChange?.('전사 요청 중...')

        // ✅ 핵심 수정: payload 객체로 감싸서 전달
        const result = await window.whisperApi.transcribeBuffer({
          arrayBuffer,
          inputLanguage: options?.inputLanguage ?? 'auto',
          whisperModel: options?.whisperModel,
          translationModel: options?.translationModel
        })

        if (!result.ok) {
          if (result.error?.includes('starting but not ready yet')) {
            options?.onStatusChange?.('worker 준비 중...')
            return
          }
          const errorMessage = result.error || '전사 실패'
          console.error('[useSystemAudioCapture] transcription failed:', errorMessage)
          options?.onError?.(errorMessage)
          options?.onStatusChange?.(`오류: ${errorMessage}`)
          return
        }

        const originalText = extractOriginalText(result)
        const translatedText = extractTranslatedText(result)

        options?.onResult?.({ originalText, translatedText, response: result })
        options?.onStatusChange?.('실시간 캡처 중')
      } catch (error) {
        console.error('[useSystemAudioCapture] onstop error:', error)
        options?.onError?.(
          error instanceof Error ? error.message : '전사 처리 중 오류가 발생했습니다.'
        )
      } finally {
        mediaRecorderRef.current = null
        clearRestartTimer()
        if (isCapturingRef.current && recordStreamRef.current) {
          startRecordingCycle()
        }
      }
    }

    mediaRecorder.start()
    clearRestartTimer()

    // 2초마다 청크 잘라서 worker로 전달
    restartTimerRef.current = window.setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, 2000)
  }

  async function startCapture(): Promise<void> {
    try {
      if (!window.whisperApi) {
        throw new Error('preload whisperApi가 연결되지 않았습니다.')
      }
      if (mediaRecorderRef.current || isCapturingRef.current) return

      options?.onStatusChange?.('시스템 오디오 캡처 요청 중...')

      const captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      captureStreamRef.current = captureStream

      const audioTracks = captureStream.getAudioTracks()
      if (audioTracks.length === 0) {
        cleanupStreams()
        throw new Error('오디오 트랙을 찾지 못했습니다. 시스템 오디오 공유를 켰는지 확인하세요.')
      }

      const recordStream = new MediaStream(audioTracks)
      recordStreamRef.current = recordStream

      isCapturingRef.current = true
      setIsCapturing(true)
      options?.onStatusChange?.('실시간 캡처 중')
      startRecordingCycle()
    } catch (error) {
      console.error('[useSystemAudioCapture] startCapture error:', error)
      isCapturingRef.current = false
      setIsCapturing(false)
      clearRestartTimer()
      cleanupStreams()
      const message = error instanceof Error ? error.message : '시스템 오디오 캡처 시작 실패'
      options?.onError?.(message)
      throw error
    }
  }

  function stopCapture(): void {
    isCapturingRef.current = false
    setIsCapturing(false)
    clearRestartTimer()
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    cleanupStreams()
    mediaRecorderRef.current = null
    options?.onStatusChange?.('중지됨')
  }

  return { isCapturing, startCapture, stopCapture }
}

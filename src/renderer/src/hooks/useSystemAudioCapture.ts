import { useRef, useState } from 'react'

type TranscriptPayload = {
  original: string
  translated: string
}

interface UseSystemAudioCaptureOptions {
  onTranscript?: (payload: TranscriptPayload) => void
  inputLanguage?: string
  whisperModel?: string
  chunkDurationMs?: number
  onStatusChange?: (message: string) => void
  onError?: (message: string) => void
}

interface UseSystemAudioCaptureReturn {
  isCapturing: boolean
  startCapture: () => Promise<void>
  stopCapture: () => void
}

type WhisperIpcResult = {
  ok?: boolean
  error?: string
  text?: string
  full_text?: string
  detected_language?: string
  whisper_model?: string
}

type RendererWhisperApi = {
  transcribeBuffer: (
    arrayBuffer: ArrayBuffer,
    inputLanguage: string,
    whisperModel?: string
  ) => Promise<WhisperIpcResult>
}

export function useSystemAudioCapture(
  options?: UseSystemAudioCaptureOptions
): UseSystemAudioCaptureReturn {
  const whisperApi = (window as unknown as { whisperApi?: RendererWhisperApi }).whisperApi

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const restartTimerRef = useRef<number | null>(null)

  const [isCapturing, setIsCapturing] = useState(false)
  const isCapturingRef = useRef(false)

  const notifyStatus = (message: string): void => {
    console.log('[capture status]', message)
    options?.onStatusChange?.(message)
  }

  const notifyError = (message: string): void => {
    console.error('[capture error]', message)
    options?.onError?.(message)
  }

  const getSupportedMimeType = (): string | undefined => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm']
    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
  }

  const clearRestartTimer = (): void => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  const getNormalizedInputLanguage = (): string => {
    const value = options?.inputLanguage?.trim()
    return value && value.length > 0 ? value : 'auto'
  }

  const getNormalizedWhisperModel = (): string | undefined => {
    const value = options?.whisperModel?.trim()
    return value && value.length > 0 ? value : undefined
  }

  const startRecordingCycle = (): void => {
    const recordStream = recordStreamRef.current

    if (!recordStream) return
    if (!isCapturingRef.current) return

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
      notifyError('MediaRecorder 오류가 발생했습니다.')
    }

    mediaRecorder.onstop = async (): Promise<void> => {
      try {
        const completeBlob = new Blob(chunks, {
          type: mimeType ?? 'audio/webm'
        })

        if (completeBlob.size > 0) {
          const arrayBuffer = await completeBlob.arrayBuffer()
          const inputLanguage = getNormalizedInputLanguage()
          const whisperModel = getNormalizedWhisperModel()

          if (!whisperApi || typeof whisperApi.transcribeBuffer !== 'function') {
            notifyError('preload의 whisperApi가 연결되지 않았습니다.')
            return
          }

          notifyStatus('Whisper 전사 요청 중...')

          const result = await whisperApi.transcribeBuffer(
            arrayBuffer,
            inputLanguage,
            whisperModel
          )

          if (!result.ok && result.error?.includes('starting but not ready yet')) {
            notifyStatus('Whisper worker 준비 중이라 이번 청크는 건너뜀')
          } else if (result.ok) {
            const original = typeof result.full_text === 'string' ? result.full_text.trim() : ''
            const translated = typeof result.text === 'string' ? result.text.trim() : ''

            if (original || translated) {
              notifyStatus('전사 결과 수신 완료')
            }

            options?.onTranscript?.({
              original,
              translated
            })
          } else {
            notifyError(result.error ?? 'Whisper 전사 실패')
          }
        }
      } catch (error) {
        notifyError(error instanceof Error ? error.message : 'onstop transcription error')
      } finally {
        mediaRecorderRef.current = null

        if (isCapturingRef.current) {
          startRecordingCycle()
        }
      }
    }

    mediaRecorder.start()

    restartTimerRef.current = window.setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, options?.chunkDurationMs ?? 2000)
  }

  const startCapture = async (): Promise<void> => {
    try {
      if (mediaRecorderRef.current || isCapturingRef.current) return

      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('현재 환경에서 getDisplayMedia를 사용할 수 없습니다.')
      }

      notifyStatus('화면/시스템 오디오 캡처 요청 중...')

      const captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })

      captureStreamRef.current = captureStream

      const audioTracks = captureStream.getAudioTracks()

      if (audioTracks.length === 0) {
        throw new Error('오디오 트랙을 찾지 못했습니다. 시스템 오디오 공유를 켰는지 확인하세요.')
      }

      const recordStream = new MediaStream(audioTracks)
      recordStreamRef.current = recordStream

      isCapturingRef.current = true
      setIsCapturing(true)

      notifyStatus(
        `캡처 시작됨 | inputLanguage=${getNormalizedInputLanguage()} | whisperModel=${getNormalizedWhisperModel() ?? 'default'}`
      )

      startRecordingCycle()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'startCapture 실행 중 알 수 없는 오류'

      notifyError(message)

      isCapturingRef.current = false
      setIsCapturing(false)

      captureStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordStreamRef.current?.getTracks().forEach((track) => track.stop())

      captureStreamRef.current = null
      recordStreamRef.current = null
      mediaRecorderRef.current = null
    }
  }

  const stopCapture = (): void => {
    isCapturingRef.current = false
    setIsCapturing(false)

    clearRestartTimer()

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }

    captureStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordStreamRef.current?.getTracks().forEach((track) => track.stop())

    captureStreamRef.current = null
    recordStreamRef.current = null
    mediaRecorderRef.current = null

    notifyStatus('캡처 중지')
  }

  return {
    isCapturing,
    startCapture,
    stopCapture
  }
}
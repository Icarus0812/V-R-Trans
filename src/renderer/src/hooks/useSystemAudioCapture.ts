import { useRef, useState } from 'react'

interface UseSystemAudioCaptureOptions {
  onTranscript?: (text: string) => void
}

interface UseSystemAudioCaptureReturn {
  isCapturing: boolean
  startCapture: () => Promise<void>
  stopCapture: () => void
}

export function useSystemAudioCapture(
  options?: UseSystemAudioCaptureOptions
): UseSystemAudioCaptureReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const recordStreamRef = useRef<MediaStream | null>(null)
  const restartTimerRef = useRef<number | null>(null)

  const [isCapturing, setIsCapturing] = useState(false)

  /**
   * 현재 환경에서 가능한 audio mime type을 고른다.
   */
  const getSupportedMimeType = (): string | undefined => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm']

    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
  }

  /**
   * 예약된 재시작 타이머를 정리한다.
   */
  const clearRestartTimer = (): void => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }

  /**
   * 현재 recorder를 종료하고 새 2초 구간 녹음을 다시 시작한다.
   * 이렇게 해야 각 청크가 독립적인 webm 파일이 된다.
   */
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

    // 현재 2초 구간의 데이터 수집
    mediaRecorder.ondataavailable = (event: BlobEvent): void => {
      if (!event.data || event.data.size === 0) return
      chunks.push(event.data)
    }

    mediaRecorder.onerror = (event: Event): void => {
      console.error('[mediaRecorder error]', event)
    }

    mediaRecorder.onstop = async (): Promise<void> => {
      try {
        // 중지된 한 구간을 하나의 완전한 Blob으로 합친다.
        const completeBlob = new Blob(chunks, {
          type: mimeType ?? 'audio/webm'
        })

        if (completeBlob.size > 0) {
          const arrayBuffer = await completeBlob.arrayBuffer()
          const result = await window.whisperApi.transcribeBuffer(arrayBuffer)

          // worker 준비 전이면 조용히 건너뜀
          if (!result.ok && result.error?.includes('starting but not ready yet')) {
            console.log('[whisper] worker 아직 준비 중, 이번 청크는 건너뜀')
          } else if (result.ok && result.text) {
            options?.onTranscript?.(result.text)
          } else if (!result.ok) {
            console.error('[whisper transcription failed]', result.error)
          }
        }
      } catch (error) {
        console.error('[onstop transcription error]', error)
      } finally {
        mediaRecorderRef.current = null

        // 아직 캡처 중이면 다음 2초 구간을 다시 시작
        if (isCapturingRef.current) {
          startRecordingCycle()
        }
      }
    }

    // 한 구간 녹음 시작
    mediaRecorder.start()

    // 2초 뒤 중지해서 독립 파일 생성
    restartTimerRef.current = window.setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, 2000)
  }

  /**
   * useRef로 현재 캡처 상태를 유지해서 onstop 안에서도 최신 상태를 본다.
   */
  const isCapturingRef = useRef(false)

  const startCapture = async (): Promise<void> => {
    try {
      if (mediaRecorderRef.current || isCapturingRef.current) return

      // 화면 + 시스템 오디오 캡처 요청
      const captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })

      captureStreamRef.current = captureStream

      // 오디오 트랙만 추출
      const audioTracks = captureStream.getAudioTracks()

      if (audioTracks.length === 0) {
        throw new Error('오디오 트랙을 찾지 못했습니다. 시스템 오디오 공유를 켰는지 확인하세요.')
      }

      // 녹음은 오디오 전용 스트림으로만 진행
      const recordStream = new MediaStream(audioTracks)
      recordStreamRef.current = recordStream

      isCapturingRef.current = true
      setIsCapturing(true)

      // 첫 구간 시작
      startRecordingCycle()
    } catch (error) {
      console.error('[startCapture error]', error)
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
  }

  return {
    isCapturing,
    startCapture,
    stopCapture
  }
}

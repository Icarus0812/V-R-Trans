import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubtitleLine } from '../types/subtitle'

type Segment = {
  chunks: string[]
  final: string
  intervalMs: number
}

type UseSubtitleDemoResult = {
  lines: SubtitleLine[]
  partialOriginal: string
  partialTranslated: string
  isRunning: boolean
  startDemo: () => void
  stopDemo: () => void
}

const SAMPLE_SEGMENTS: Segment[] = [
  {
    chunks: ['지금', '지금부터', '지금부터 시작', '지금부터 시작하겠습니다'],
    final: '지금부터 시작하겠습니다.',
    intervalMs: 500
  },
  {
    chunks: ['조금', '조금만', '조금만 기다려', '조금만 기다려 주세요'],
    final: '조금만 기다려 주세요.',
    intervalMs: 500
  },
  {
    chunks: ['오늘은', '오늘은 새로운', '오늘은 새로운 공지', '오늘은 새로운 공지가 있습니다'],
    final: '오늘은 새로운 공지가 있습니다.',
    intervalMs: 500
  },
  {
    chunks: ['다음', '다음 곡은', '다음 곡은 바로', '다음 곡은 바로 이어서 갑니다'],
    final: '다음 곡은 바로 이어서 갑니다.',
    intervalMs: 500
  }
]

function buildTranslated(text: string, language: string): string {
  if (!text) return ''

  switch (language) {
    case 'ko':
      return text
    case 'en':
      return `[EN] ${text}`
    case 'ja':
      return `[JA] ${text}`
    case 'zh':
      return `[ZH] ${text}`
    default:
      return text
  }
}

export function useSubtitleDemo(language: string): UseSubtitleDemoResult {
  const [rawLines, setRawLines] = useState<SubtitleLine[]>([])
  const [partialOriginal, setPartialOriginal] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const timerRef = useRef<number | null>(null)
  const segmentIndexRef = useRef(0)
  const chunkIndexRef = useRef(0)

  const partialTranslated = useMemo((): string => {
    return buildTranslated(partialOriginal, language)
  }, [partialOriginal, language])

  const lines = useMemo((): SubtitleLine[] => {
    return rawLines.map((line) => ({
      ...line,
      translated: buildTranslated(line.original, language)
    }))
  }, [rawLines, language])

  function clearTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function stopDemo(): void {
    clearTimer()
    setIsRunning(false)
    setPartialOriginal('')
    segmentIndexRef.current = 0
    chunkIndexRef.current = 0
  }

  function runTick(): void {
    const segment = SAMPLE_SEGMENTS[segmentIndexRef.current]

    if (!segment) {
      stopDemo()
      return
    }

    const chunk = segment.chunks[chunkIndexRef.current]

    if (chunk) {
      setPartialOriginal(chunk)
      chunkIndexRef.current += 1
      timerRef.current = window.setTimeout(runTick, segment.intervalMs)
      return
    }

    const finalOriginal = segment.final

    setRawLines((prev): SubtitleLine[] => {
      const next: SubtitleLine = {
        id: `${Date.now()}-${Math.random()}`,
        original: finalOriginal,
        translated: '',
        createdAt: Date.now()
      }

      return [next, ...prev].slice(0, 5)
    })

    setPartialOriginal('')
    segmentIndexRef.current += 1
    chunkIndexRef.current = 0
    timerRef.current = window.setTimeout(runTick, 650)
  }

  function startDemo(): void {
    if (isRunning) return

    clearTimer()
    setRawLines([])
    setPartialOriginal('')
    segmentIndexRef.current = 0
    chunkIndexRef.current = 0
    setIsRunning(true)

    runTick()
  }

  useEffect((): (() => void) => {
    return (): void => {
      clearTimer()
    }
  }, [])

  return {
    lines,
    partialOriginal,
    partialTranslated,
    isRunning,
    startDemo,
    stopDemo
  }
}

import type { JSX } from 'react'
import { useState } from 'react'
import './App.css'
import { useSystemAudioCapture } from './hooks/useSystemAudioCapture'
import type { SubtitleLine } from './types/subtitle'

const WHISPER_MODELS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large-v1',
  'large-v2',
  'large-v3',
  'distil-large-v3'
] as const

function App(): JSX.Element {
  const [inputLanguage, setInputLanguage] = useState('auto')
  const [whisperModel, setWhisperModel] = useState('small')
  const [captureStatus, setCaptureStatus] = useState('진단 화면 렌더링 완료')
  const [captureError, setCaptureError] = useState('')
  const [partialOriginal, setPartialOriginal] = useState('')
  const [partialTranslated, setPartialTranslated] = useState('')
  const [lines, setLines] = useState<SubtitleLine[]>([])

  const { isCapturing, startCapture, stopCapture } = useSystemAudioCapture({
    inputLanguage,
    whisperModel,
    onStatusChange: (message) => {
      setCaptureStatus(message)
    },
    onError: (message) => {
      setCaptureError(message)
      setCaptureStatus('오류 발생')
    },
    onTranscript: ({ original, translated }) => {
      const safeOriginal = typeof original === 'string' ? original.trim() : ''
      const safeTranslated = typeof translated === 'string' ? translated.trim() : ''

      setPartialOriginal(safeOriginal)
      setPartialTranslated(safeTranslated || safeOriginal)

      setLines((prev) =>
        [
          ...prev,
          {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            original: safeOriginal,
            translated: safeTranslated || safeOriginal
          }
        ].slice(-20)
      )
    }
  })

  const handleStart = (): void => {
    setCaptureError('')
    setCaptureStatus('진단 시작 버튼 클릭됨')
    void startCapture()
  }

  const handleStop = (): void => {
    stopCapture()
    setCaptureStatus('진단 정지 버튼 클릭됨')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f1115',
        color: '#ffffff',
        padding: 24,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          background: '#d32f2f',
          color: '#fff',
          fontWeight: 800,
          fontSize: 22,
          padding: '16px 20px',
          borderRadius: 12,
          marginBottom: 20
        }}
      >
        DEBUG APP ACTIVE
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20
        }}
      >
        <section
          style={{
            background: '#171a21',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 20
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Whisper 진단 패널</h2>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>입력 언어</label>
            <select
              value={inputLanguage}
              onChange={(event) => setInputLanguage(event.target.value)}
              disabled={isCapturing}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: '#232833',
                color: '#fff'
              }}
            >
              <option value="auto">auto</option>
              <option value="ko">ko</option>
              <option value="en">en</option>
              <option value="ja">ja</option>
              <option value="zh">zh</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>Whisper 모델</label>
            <select
              value={whisperModel}
              onChange={(event) => setWhisperModel(event.target.value)}
              disabled={isCapturing}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: '#232833',
                color: '#fff'
              }}
            >
              {WHISPER_MODELS.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={handleStart}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#2e7d32',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              진단 시작
            </button>

            <button
              type="button"
              onClick={handleStop}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#6d4c41',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              진단 정지
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>현재 상태: {isCapturing ? '캡처 중' : '정지'}</div>
          <div style={{ marginBottom: 8 }}>선택 언어: {inputLanguage}</div>
          <div style={{ marginBottom: 12 }}>선택 모델: {whisperModel}</div>

          <div
            style={{
              minHeight: 80,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              color: captureError ? '#ff8a8a' : '#e0e0e0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {captureError || captureStatus}
          </div>
        </section>

        <section
          style={{
            background: '#171a21',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 20
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>전사 결과</h2>

          <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>원문</div>
          <div
            style={{
              minHeight: 80,
              padding: 12,
              borderRadius: 10,
              background: '#232833',
              marginBottom: 16,
              whiteSpace: 'pre-wrap'
            }}
          >
            {partialOriginal || '아직 원문 없음'}
          </div>

          <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>번역</div>
          <div
            style={{
              minHeight: 80,
              padding: 12,
              borderRadius: 10,
              background: '#232833',
              marginBottom: 16,
              whiteSpace: 'pre-wrap'
            }}
          >
            {partialTranslated || '아직 번역 없음'}
          </div>

          <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>히스토리</div>
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              display: 'grid',
              gap: 10
            }}
          >
            {lines.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#232833',
                  opacity: 0.8
                }}
              >
                아직 히스토리 없음
              </div>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#232833'
                  }}
                >
                  <div style={{ marginBottom: 6, opacity: 0.8 }}>{line.original}</div>
                  <div style={{ fontWeight: 700 }}>{line.translated}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
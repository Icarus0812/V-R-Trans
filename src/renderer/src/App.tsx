import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import VideoPane from './components/VideoPane'
import ChatPane from './components/ChatPane'
import SubtitlePane from './components/SubtitlePane'
import { extractVideoId } from './utils/youtube'
import { useSystemAudioCapture } from './hooks/useSystemAudioCapture'

// 다운로드 진행률 상태 타입
type DownloadStatus = {
  active: boolean
  stage: string
  model: string
  percent: number
  desc: string
} | null

function App(): JSX.Element {
  // 유튜브 URL 입력값
  const [url, setUrl] = useState('')

  // 실제로 로드된 URL
  const [loadedUrl, setLoadedUrl] = useState('')

  // 입력 언어
  const [inputLanguage, setInputLanguage] = useState('auto')

  // 출력 언어
  const [outputLanguage, setOutputLanguage] = useState('ko')

  // 채팅 표시 여부
  const [isChatVisible, setIsChatVisible] = useState(true)

  // 상단 바 hover 상태
  const [isTopbarHovered, setIsTopbarHovered] = useState(false)

  // 현재 전사된 원문
  const [partialOriginal, setPartialOriginal] = useState('')

  // 한국어 번역 결과
  const [partialTranslated, setPartialTranslated] = useState('')

  // 선택된 Whisper 모델
  const [whisperModel, setWhisperModel] = useState('small')

  // 선택된 번역 모델
  const [translationModel, setTranslationModel] = useState('facebook/nllb-200-distilled-600M')

  // 모델 다운로드 진행률
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>(null)

  // 유튜브 video id 추출
  const videoId = useMemo(() => extractVideoId(loadedUrl), [loadedUrl])

  // 영상 iframe URL
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?playsinline=1&origin=${encodeURIComponent(window.location.origin)}`
    : ''

  // 채팅 iframe URL
  const chatUrl = videoId
    ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}`
    : ''

  // 상단 바 표시 여부
  const isTopbarOpen = !videoId || isTopbarHovered

  // 다운로드 진행률 구독
  useEffect((): (() => void) => {
    const unsubscribe = window.whisperApi.onDownloadProgress((data) => {
      if (data.type === 'download_progress') {
        // tqdm 진행률 업데이트
        setDownloadStatus({
          active: true,
          stage: data.stage ?? 'model',
          model: data.model ?? data.desc ?? '',
          percent: data.percent ?? 0,
          desc: data.desc ?? ''
        })
      } else if (data.type === 'model_loading') {
        if (data.status === 'start') {
          // 모델 로딩 시작
          setDownloadStatus({
            active: true,
            stage: data.stage ?? 'model',
            model: data.model ?? '',
            percent: 0,
            desc: `${data.model ?? ''} 로딩 중...`
          })
        } else if (data.status === 'done') {
          // 완료 후 1.5초 뒤 숨김
          setTimeout(() => setDownloadStatus(null), 1500)
        }
      }
    })
    return unsubscribe
  }, [])

  // 시스템 오디오 캡처 + Whisper 전사
  const { isCapturing, startCapture, stopCapture } = useSystemAudioCapture({
    inputLanguage,
    whisperModel,
    translationModel,
    onResult: ({ originalText, translatedText }): void => {
      setPartialOriginal(originalText)
      setPartialTranslated(translatedText)
    },
    onStatusChange: (msg): void => {
      console.log('[App] status:', msg)
    },
    onError: (msg): void => {
      console.error('[App] error:', msg)
    }
  })

  function handleLoad(): void {
    if (!url.trim()) return
    setLoadedUrl(url.trim())
    setIsTopbarHovered(false)
  }

  return (
    <div className="app">
      <div className="topbar-trigger" onMouseEnter={() => setIsTopbarHovered(true)} />

      <div
        className={`topbar-shell ${isTopbarOpen ? 'open' : 'closed'}`}
        onMouseEnter={() => setIsTopbarHovered(true)}
        onMouseLeave={() => setIsTopbarHovered(false)}
      >
        <TopBar
          url={url}
          inputLanguage={inputLanguage}
          outputLanguage={outputLanguage}
          isChatVisible={isChatVisible}
          whisperModel={whisperModel}
          translationModel={translationModel}
          onUrlChange={setUrl}
          onInputLanguageChange={setInputLanguage}
          onOutputLanguageChange={setOutputLanguage}
          onWhisperModelChange={setWhisperModel}
          onTranslationModelChange={setTranslationModel}
          onLoad={handleLoad}
          onToggleChat={() => setIsChatVisible((prev) => !prev)}
        />
      </div>

      {/* 모델 다운로드 진행률 오버레이 */}
      {downloadStatus?.active ? (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: '#1e3a5f',
            border: '1px solid #2563eb',
            borderRadius: '14px',
            padding: '14px 18px',
            width: '320px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)'
          }}
        >
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '13px' }}>
              {downloadStatus.stage === 'whisper' ? '🔊 Whisper 모델' : '🌐 번역 모델'} 다운로드 중
            </span>
            <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 700 }}>
              {downloadStatus.percent.toFixed(1)}%
            </span>
          </div>

          {/* 모델명 */}
          <div style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>
            {downloadStatus.model || downloadStatus.desc}
          </div>

          {/* 프로그레스 바 */}
          <div
            style={{
              height: '6px',
              backgroundColor: '#1e293b',
              borderRadius: '999px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${downloadStatus.percent}%`,
                backgroundColor: '#2563eb',
                borderRadius: '999px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      ) : null}

      <main className="workspace">
        <section className={`content-row ${!isChatVisible ? 'chat-hidden' : ''}`}>
          <VideoPane videoId={videoId} embedUrl={embedUrl} />
          {isChatVisible && (
            <ChatPane videoId={videoId} chatUrl={chatUrl} language={inputLanguage} />
          )}
        </section>

        <SubtitlePane
          lines={[]}
          partialOriginal={partialOriginal}
          partialTranslated={partialTranslated}
          isRunning={isCapturing}
          onStartDemo={startCapture}
          onStopDemo={stopCapture}
        />
      </main>
    </div>
  )
}

export default App

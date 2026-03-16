import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import VideoPane from './components/VideoPane'
import ChatPane from './components/ChatPane'
import SubtitlePane from './components/SubtitlePane'
import { extractVideoId } from './utils/youtube'
import { useSystemAudioCapture } from './hooks/useSystemAudioCapture'
function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [language, setLanguage] = useState('ko')
  const [isChatVisible, setIsChatVisible] = useState(true)
  const [isTopbarHovered, setIsTopbarHovered] = useState(false)

  // 현재 전사 중인 부분 텍스트
  const [partialOriginal, setPartialOriginal] = useState('')

  // 번역은 아직 안 붙였으므로 빈 문자열 유지
  const [partialTranslated] = useState('')

  const videoId = useMemo(() => extractVideoId(loadedUrl), [loadedUrl])

  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?playsinline=1&origin=${encodeURIComponent(window.location.origin)}`
    : ''

  const chatUrl = videoId
    ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}`
    : ''

  const isTopbarOpen = !loadedUrl || isTopbarHovered

  // 시스템 오디오 캡처 + Whisper 전사
  const { isCapturing, startCapture, stopCapture } = useSystemAudioCapture({
    onTranscript: (text: string): void => {
      // 최신 전사 결과만 표시
      setPartialOriginal(text)
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
          language={language}
          isChatVisible={isChatVisible}
          onUrlChange={setUrl}
          onLanguageChange={setLanguage}
          onLoad={handleLoad}
          onToggleChat={() => setIsChatVisible((prev) => !prev)}
        />
      </div>

      <main className="workspace">
        <section className={`content-row ${!isChatVisible ? 'chat-hidden' : ''}`}>
          <VideoPane videoId={videoId} embedUrl={embedUrl} />
          {isChatVisible && <ChatPane videoId={videoId} chatUrl={chatUrl} language={language} />}
        </section>

        <SubtitlePane
          // 아직 누적 자막 목록은 안 쓰므로 빈 배열
          lines={[]}
          // 현재 전사 결과 표시
          partialOriginal={partialOriginal}
          // 번역기는 아직 미구현
          partialTranslated={partialTranslated}
          // 데모 실행 여부 대신 실제 캡처 상태 연결
          isRunning={isCapturing}
          // 기존 버튼 구조를 그대로 활용
          onStartDemo={startCapture}
          onStopDemo={stopCapture}
        />
      </main>
    </div>
  )
}

export default App

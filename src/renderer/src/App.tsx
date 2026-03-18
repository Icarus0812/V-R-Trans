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
  // 유튜브 URL 입력값
  const [url, setUrl] = useState('')

  // 실제로 로드된 URL
  const [loadedUrl, setLoadedUrl] = useState('')

  // 입력 언어: Whisper가 어떤 언어로 인식할지
  const [inputLanguage, setInputLanguage] = useState('auto')

  // 출력 언어: 번역 결과를 어떤 언어로 보여줄지
  const [outputLanguage, setOutputLanguage] = useState('ko')

  // 채팅 표시 여부
  const [isChatVisible, setIsChatVisible] = useState(true)

  // 상단 바 hover 상태
  const [isTopbarHovered, setIsTopbarHovered] = useState(false)

  // 현재 전사된 원문
  const [partialOriginal, setPartialOriginal] = useState('')

  // 아직 번역 미구현이므로 빈 문자열 유지
  const [partialTranslated] = useState('')

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

  // 시스템 오디오 캡처 + Whisper 전사
  const { isCapturing, startCapture, stopCapture } = useSystemAudioCapture({
    onTranscript: (text: string): void => {
      // 최신 전사 결과만 표시
      setPartialOriginal(text)
    }
  })

  /**
   * 유튜브 URL 로드
   */
  function handleLoad(): void {
    if (!url.trim()) return

    setLoadedUrl(url.trim())
    setIsTopbarHovered(false)
  }

  return (
    <div className="app">
      <div
   className="topbar-trigger" onMouseEnter={() => setIsTopbarHovered(true)} />

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
          onUrlChange={setUrl}
          onInputLanguageChange={setInputLanguage}
          onOutputLanguageChange={setOutputLanguage}
          onLoad={handleLoad}
          onToggleChat={() => setIsChatVisible((prev) => !prev)}
        />
      </div>

      <main className="workspace">
        <section className={`content-row ${!isChatVisible ? 'chat-hidden' : ''}`}>
          <VideoPane videoId={videoId} embedUrl={embedUrl} />
          {isChatVisible && (
            <ChatPane
              videoId={videoId}
              chatUrl={chatUrl}
              language={inputLanguage}
            />
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

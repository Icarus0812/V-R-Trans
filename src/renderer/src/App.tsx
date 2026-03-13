import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import VideoPane from './components/VideoPane'
import ChatPane from './components/ChatPane'
import SubtitlePane from './components/SubtitlePane'
import { extractVideoId } from './utils/youtube'
import { useSubtitleDemo } from './hooks/useSubtitleDemo'

function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [loadedUrl, setLoadedUrl] = useState('')
  const [language, setLanguage] = useState('ko')
  const [isChatVisible, setIsChatVisible] = useState(true)
  const [isTopbarHovered, setIsTopbarHovered] = useState(false)

  const videoId = useMemo(() => extractVideoId(loadedUrl), [loadedUrl])

  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?playsinline=1&origin=${encodeURIComponent(window.location.origin)}`
    : ''

  const chatUrl = videoId
    ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}`
    : ''

  const isTopbarOpen = !loadedUrl || isTopbarHovered

  const { lines, partialOriginal, partialTranslated, isRunning, startDemo, stopDemo } =
    useSubtitleDemo(language)

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
          lines={lines}
          partialOriginal={partialOriginal}
          partialTranslated={partialTranslated}
          isRunning={isRunning}
          onStartDemo={startDemo}
          onStopDemo={stopDemo}
        />
      </main>
    </div>
  )
}

export default App

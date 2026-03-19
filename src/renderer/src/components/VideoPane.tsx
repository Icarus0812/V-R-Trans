import type { JSX } from 'react'
import { useRef } from 'react'

type VideoPaneProps = {
  videoId?: string
  embedUrl: string
}

function VideoPane({ videoId, embedUrl }: VideoPaneProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // iframe 새로고침
  function handleRefresh(): void {
    if (iframeRef.current) {
      iframeRef.current.src = embedUrl
    }
  }

  return (
    <section className="video-pane">
      {videoId ? (
        <div className="video-shell">
          {/* 새로고침 버튼 */}
          <button
            type="button"
            onClick={handleRefresh}
            title="영상 새로고침"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 10,
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #374151',
              backgroundColor: 'rgba(17,24,39,0.8)',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}
          >
            ↺
          </button>

          <iframe
            ref={iframeRef}
            className="video-frame"
            src={embedUrl}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="video-placeholder">
          <p>유튜브 URL을 입력하고 불러오기를 눌러주세요.</p>
        </div>
      )}
    </section>
  )
}

export default VideoPane

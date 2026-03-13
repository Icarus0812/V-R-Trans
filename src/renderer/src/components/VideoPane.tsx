import type { JSX } from 'react'

type VideoPaneProps = {
  videoId?: string
  embedUrl: string
}

function VideoPane({ videoId, embedUrl }: VideoPaneProps): JSX.Element {
  return (
    <section className="video-pane">
      {videoId ? (
        <div className="video-shell">
          <iframe
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

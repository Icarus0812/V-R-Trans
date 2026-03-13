import type { JSX } from 'react'

type ChatPaneProps = {
  videoId?: string
  chatUrl: string
  language: string
}

function ChatPane({ videoId, chatUrl, language }: ChatPaneProps): JSX.Element {
  return (
    <aside className="chat-pane">
      {videoId ? (
        <iframe
          className="chat-frame"
          src={chatUrl}
          title="YouTube live chat"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="chat-placeholder">
          <p>라이브 URL을 불러오면 채팅이 표시됩니다.</p>
          <p>선택 언어: {language}</p>
        </div>
      )}
    </aside>
  )
}

export default ChatPane

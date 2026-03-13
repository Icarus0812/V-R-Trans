import type { JSX } from 'react'

type TopBarProps = {
  url: string
  language: string
  isChatVisible: boolean
  onUrlChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onLoad: () => void
  onToggleChat: () => void
}

function TopBar({
  url,
  language,
  isChatVisible,
  onUrlChange,
  onLanguageChange,
  onLoad,
  onToggleChat
}: TopBarProps): JSX.Element {
  return (
    <header className="topbar">
      <input
        className="url-input"
        type="text"
        placeholder="유튜브 스트리밍 URL 입력"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
      />

      <select
        className="lang-select"
        value={language}
        onChange={(e) => onLanguageChange(e.target.value)}
      >
        <option value="ko">한국어</option>
        <option value="en">영어</option>
        <option value="ja">일본어</option>
        <option value="zh">중국어</option>
      </select>

      <button className="action-btn" onClick={onLoad}>
        불러오기
      </button>

      <button className="action-btn" onClick={onToggleChat}>
        {isChatVisible ? '채팅 숨기기' : '채팅 보이기'}
      </button>

      <button className="action-btn" disabled>
        패널 추가
      </button>
    </header>
  )
}

export default TopBar

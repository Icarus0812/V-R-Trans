import type { JSX, ChangeEvent } from 'react'

interface TopBarProps {
  // 유튜브 URL 입력값
  url: string

  // 입력 언어: Whisper가 어떤 언어로 인식할지
  inputLanguage: string

  // 출력 언어: 번역 결과를 어떤 언어로 보여줄지
  outputLanguage: string

  // 채팅 표시 여부
  isChatVisible: boolean

  // URL 변경 핸들러
  onUrlChange: (value: string) => void

  // 입력 언어 변경 핸들러
  onInputLanguageChange: (value: string) => void

  // 출력 언어 변경 핸들러
  onOutputLanguageChange: (value: string) => void

  // URL 로드
  onLoad: () => void

  // 채팅 토글
  onToggleChat: () => void
}

function TopBar({
  url,
  inputLanguage,
  outputLanguage,
  isChatVisible,
  onUrlChange,
  onInputLanguageChange,
  onOutputLanguageChange,
  onLoad,
  onToggleChat
}: TopBarProps): JSX.Element {
  /**
   * URL 입력 변경
   */
  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onUrlChange(event.target.value)
  }

  /**
   * 입력 언어 선택 변경
   */
  const handleInputLanguageChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onInputLanguageChange(event.target.value)
  }

  /**
   * 출력 언어 선택 변경
   */
  const handleOutputLanguageChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onOutputLanguageChange(event.target.value)
  }

  /**
   * 엔터 누르면 영상 로드
   */
  const handleUrlKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      onLoad()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        backgroundColor: '#111',
        borderBottom: '1px solid #2a2a2a'
      }}
    >
      {/* 유튜브 URL 입력 */}
      <input
        type="text"
        value={url}
        onChange={handleUrlChange}
        onKeyDown={handleUrlKeyDown}
        placeholder="유튜브 URL 입력"
        style={{
          flex: 1,
          minWidth: '260px',
          height: '36px',
          padding: '0 10px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          outline: 'none'
        }}
      />

      {/* 입력 언어 선택 */}
      <select
        value={inputLanguage}
        onChange={handleInputLanguageChange}
        style={{
          height: '36px',
          padding: '0 10px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff'
        }}
      >
        <option value="auto">입력: 자동 감지</option>
        <option value="ja">입력: 일본어</option>
        <option value="en">입력: 영어</option>
        <option value="ko">입력: 한국어</option>
      </select>

      {/* 출력 언어 선택 */}
      <select
        value={outputLanguage}
        onChange={handleOutputLanguageChange}
        style={{
          height: '36px',
          padding: '0 10px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff'
        }}
      >
        <option value="ko">출력: 한국어</option>
        <option value="ja">출력: 일본어</option>
        <option value="en">출력: 영어</option>
      </select>

      {/* 영상 로드 버튼 */}
      <button
        type="button"
        onClick={onLoad}
        style={{
          height: '36px',
          padding: '0 14px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#222',
          color: '#fff',
          cursor: 'pointer'
        }}
      >
        불러오기
      </button>

      {/* 채팅 표시/숨김 버튼 */}
      <button
        type="button"
        onClick={onToggleChat}
        style={{
          height: '36px',
          padding: '0 14px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#222',
          color: '#fff',
          cursor: 'pointer'
        }}
      >
        {isChatVisible ? '채팅 숨기기' : '채팅 보이기'}
      </button>
    </div>
  )
}

export default TopBar

import type { JSX, ChangeEvent } from 'react'

// Whisper 모델 옵션
const WHISPER_MODEL_OPTIONS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large-v1',
  'large-v2',
  'large-v3',
  'distil-large-v3'
] as const

// 번역 모델 옵션 (NLLB)
const TRANSLATION_MODEL_OPTIONS = [
  { label: 'NLLB 600M (빠름)', value: 'facebook/nllb-200-distilled-600M' },
  { label: 'NLLB 1.3B (균형)', value: 'facebook/nllb-200-distilled-1.3B' },
  { label: 'NLLB 3.3B (고품질)', value: 'facebook/nllb-200-3.3B' }
] as const

interface TopBarProps {
  url: string
  inputLanguage: string
  outputLanguage: string
  isChatVisible: boolean
  whisperModel: string
  translationModel: string
  onUrlChange: (value: string) => void
  onInputLanguageChange: (value: string) => void
  onOutputLanguageChange: (value: string) => void
  onWhisperModelChange: (value: string) => void
  onTranslationModelChange: (value: string) => void
  onLoad: () => void
  onToggleChat: () => void
}

// select 공통 스타일
const selectStyle: React.CSSProperties = {
  height: '36px',
  padding: '0 10px',
  border: '1px solid #333',
  borderRadius: '8px',
  backgroundColor: '#1a1a1a',
  color: '#fff',
  fontSize: '13px'
}

function TopBar({
  url,
  inputLanguage,
  outputLanguage,
  isChatVisible,
  whisperModel,
  translationModel,
  onUrlChange,
  onInputLanguageChange,
  onOutputLanguageChange,
  onWhisperModelChange,
  onTranslationModelChange,
  onLoad,
  onToggleChat
}: TopBarProps): JSX.Element {
  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>): void => {
    onUrlChange(e.target.value)
  }

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') onLoad()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
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
          minWidth: '200px',
          height: '36px',
          padding: '0 10px',
          border: '1px solid #333',
          borderRadius: '8px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          outline: 'none',
          fontSize: '13px'
        }}
      />

      {/* 입력 언어 */}
      <select
        value={inputLanguage}
        onChange={(e) => onInputLanguageChange(e.target.value)}
        style={selectStyle}
      >
        <option value="auto">입력: 자동 감지</option>
        <option value="ja">입력: 일본어</option>
        <option value="en">입력: 영어</option>
        <option value="ko">입력: 한국어</option>
      </select>

      {/* 출력 언어 */}
      <select
        value={outputLanguage}
        onChange={(e) => onOutputLanguageChange(e.target.value)}
        style={selectStyle}
      >
        <option value="ko">출력: 한국어</option>
        <option value="ja">출력: 일본어</option>
        <option value="en">출력: 영어</option>
      </select>

      {/* Whisper 모델 */}
      <select
        value={whisperModel}
        onChange={(e) => onWhisperModelChange(e.target.value)}
        style={selectStyle}
      >
        {WHISPER_MODEL_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* 번역 모델 */}
      <select
        value={translationModel}
        onChange={(e) => onTranslationModelChange(e.target.value)}
        style={selectStyle}
      >
        {TRANSLATION_MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* 불러오기 버튼 */}
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
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        불러오기
      </button>

      {/* 채팅 토글 버튼 */}
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
          cursor: 'pointer',
          fontSize: '13px'
        }}
      >
        {isChatVisible ? '채팅 숨기기' : '채팅 보이기'}
      </button>
    </div>
  )
}

export default TopBar

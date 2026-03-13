import type { JSX } from 'react'
import type { SubtitleLine } from '../types/subtitle'

type SubtitlePaneProps = {
  lines: SubtitleLine[]
  partialOriginal: string
  partialTranslated: string
  isRunning: boolean
  onStartDemo: () => void
  onStopDemo: () => void
}

function SubtitlePane({
  lines,
  partialOriginal,
  partialTranslated,
  isRunning,
  onStartDemo,
  onStopDemo
}: SubtitlePaneProps): JSX.Element {
  return (
    <section className="subtitle-pane">
      <div className="subtitle-toolbar">
        <div className="subtitle-status">
          {isRunning ? '실시간 테스트 중' : '대기 중'}
        </div>

        <div className="subtitle-actions">
          <button className="subtitle-btn" onClick={onStartDemo} disabled={isRunning}>
            테스트 시작
          </button>
          <button className="subtitle-btn secondary" onClick={onStopDemo}>
            중지
          </button>
        </div>
      </div>

      <div className="subtitle-live">
        <div className="subtitle-live-original">
          {partialOriginal || '원문 인식 대기 중'}
        </div>
        <div className="subtitle-live-translated">
          {partialTranslated || '번역 자막 대기 중'}
        </div>
      </div>

      <div className="subtitle-history">
        {lines.length === 0 ? (
          <div className="subtitle-empty">아직 확정된 자막이 없습니다.</div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="subtitle-line">
              <div className="subtitle-line-original">{line.original}</div>
              <div className="subtitle-line-translated">{line.translated}</div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default SubtitlePane

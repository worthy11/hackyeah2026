import { useState } from 'react'
import { Icon } from '../Icon'
import type { Gesture } from '../../data/mockLearning'
import { useRecorder, type RecorderState } from '../../hooks/useRecorder'
import { useGestureVideos, type GestureVideo } from '../../hooks/useGestureVideos'
import { TempoAdjuster, VersionedGesturePlayer } from './GestureVideoPlayer'
import { GradePanel } from './GradePanel'

type ShellProps = {
  title: string
  videos: GestureVideo[]
  expectedGlosses: string[]
  demoKey: string
  onBack: () => void
}

/** Shared learn practice layout — used by both gesture and phrase views. */
export function PracticeShell({ title, videos, expectedGlosses, demoKey, onBack }: ShellProps) {
  // Single camera stream for the whole practice visit; released on leave (unmount).
  const { state, result, error, videoRef, start, stop, reset } = useRecorder(expectedGlosses, {
    demoKey,
    preview: true,
  })
  const [tempo, setTempo] = useState(1)

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wróć
      </button>

      <header className="learn-header practice-header">
        <h2>{title}</h2>
        {videos.length > 1 && (
          <span className="eyebrow eyebrow--green">{videos.length} nagrania dostępne</span>
        )}
      </header>

      <div className="practice-split">
        <div className="practice-pane">
          <span className="practice-pane__label">
            <span>Wzór</span>
            {videos.length > 0
              ? <TempoAdjuster value={tempo} onChange={setTempo} />
              : <span className="tempo-adjuster tempo-adjuster--spacer" aria-hidden />
            }
          </span>
          <div className="practice-pane__media">
            {videos.length > 0
              ? <VersionedGesturePlayer versions={videos} className="practice-video" playbackRate={tempo} />
              : <div className="practice-pane__placeholder"><Icon name="play" size={32} /></div>
            }
          </div>
        </div>

        <div className="practice-pane">
          <span className="practice-pane__label">
            <span>Twoja kamera</span>
            <span className="tempo-adjuster tempo-adjuster--spacer" aria-hidden />
          </span>
          <div className="practice-pane__media">
            <div className="versioned-player">
              <video
                ref={videoRef}
                className="practice-video practice-video--mirror"
                muted
                playsInline
              />
              {state === 'recording' && <span className="record-indicator" />}
            </div>
          </div>
        </div>
      </div>

      {(state === 'idle' || state === 'recording' || state === 'grading' || state === 'error') && (
        <RecordBar state={state} error={error} onStart={start} onStop={stop} onReset={reset} />
      )}

      {result && <GradePanel result={result} expectedGlosses={expectedGlosses} />}

      {state === 'graded' && (
        <RecordBar state={state} error={error} onStart={start} onStop={stop} onReset={reset} />
      )}
    </main>
  )
}

type Props = { gesture: Gesture; onBack: () => void }

export function GesturePractice({ gesture, onBack }: Props) {
  const glossKey = gesture.gloss.toUpperCase().trim()
  const { versions } = useGestureVideos()
  const videos = versions[glossKey] ?? []

  return (
    <PracticeShell
      title={gesture.gloss}
      videos={videos}
      expectedGlosses={[gesture.gloss]}
      demoKey={glossKey}
      onBack={onBack}
    />
  )
}

// ── Shared recording bar ──────────────────────────────────────────────────────

type RecordBarProps = {
  state: RecorderState
  error: string | null
  onStart: () => void
  onStop: () => void
  onReset: () => void
}

export function RecordBar({ state, error, onStart, onStop, onReset }: RecordBarProps) {
  return (
    <div className={`record-bar record-bar--${state}`}>
      {state === 'idle' && (
        <button className="record-bar__btn record-bar__btn--start" onClick={onStart} type="button">
          <Icon name="play" size={16} /> Nagraj i oceń
        </button>
      )}
      {state === 'recording' && (
        <button className="record-bar__btn record-bar__btn--stop" onClick={onStop} type="button">
          <span className="record-indicator record-indicator--inline" />
          Zatrzymaj
        </button>
      )}
      {state === 'grading' && (
        <span className="record-bar__status">
          <span className="spinner" /> Ocenianie…
        </span>
      )}
      {state === 'error' && (
        <div className="record-bar__error-row">
          <span className="record-bar__status record-bar__status--error">
            <Icon name="info" size={16} /> {error}
          </span>
          <button className="record-bar__btn record-bar__btn--retry" onClick={onReset} type="button">
            Spróbuj ponownie
          </button>
        </div>
      )}
      {state === 'graded' && (
        <button className="record-bar__btn record-bar__btn--retry" onClick={onReset} type="button">
          <Icon name="play" size={15} /> Nagraj ponownie
        </button>
      )}
    </div>
  )
}

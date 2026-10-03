import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { Gesture } from '../../data/mockLearning'
import { useRecorder } from '../../hooks/useRecorder'
import { useGestureVideos } from '../../hooks/useGestureVideos'
import { VersionedGesturePlayer } from './GestureVideoPlayer'
import { GradePanel } from './GradePanel'

type Props = { gesture: Gesture; onBack: () => void }

export function GesturePractice({ gesture, onBack }: Props) {
  const { state, result, error, start, stop, reset } = useRecorder([gesture.gloss])
  const { versions } = useGestureVideos()
  const videos = versions[gesture.gloss.toUpperCase().trim()] ?? []

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wróć
      </button>

      <header className="learn-header practice-header">
        <h2>{gesture.gloss}</h2>
        {videos.length > 1 && (
          <span className="eyebrow eyebrow--green">{videos.length} nagrania dostępne</span>
        )}
      </header>

      <div className="practice-split">
        {/* Reference video */}
        <div className="practice-pane">
          <span className="practice-pane__label">Wzór</span>
          <div className="practice-pane__media">
            {videos.length > 0
              ? <VersionedGesturePlayer versions={videos} className="practice-video" />
              : <div className="practice-pane__placeholder"><Icon name="play" size={32} /></div>
            }
          </div>
        </div>

        {/* User webcam */}
        <div className="practice-pane">
          <span className="practice-pane__label">Twoja kamera</span>
          <div className="practice-pane__media">
            <WebcamPane recording={state === 'recording'} />
          </div>
        </div>
      </div>

      <RecordBar state={state} error={error} onStart={start} onStop={stop} onReset={reset} />

      {result && <GradePanel result={result} expectedGlosses={[gesture.gloss]} />}
    </main>
  )
}

// ── Live webcam pane ──────────────────────────────────────────────────────────

export function WebcamPane({ recording }: { recording: boolean }) {
  const ref        = useRef<HTMLVideoElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  async function startCam(facingMode: 'user' | 'environment') {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false })
      streamRef.current = s
      if (ref.current) { ref.current.srcObject = s; ref.current.play() }
    } catch {}
  }

  useEffect(() => { startCam('user'); return () => streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  async function flip() {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    await startCam(next)
  }

  return (
    <>
      <video ref={ref} className="practice-video practice-video--mirror" muted playsInline />
      {recording && <span className="record-indicator" />}
      {!recording && (
        <button className="cam-flip-btn" onClick={flip} type="button" aria-label="Odwróć kamerę">
          <Icon name="flip-camera" size={22} />
        </button>
      )}
    </>
  )
}

// ── Shared recording bar (also used by PhrasePractice) ───────────────────────

type RecordBarProps = {
  state: ReturnType<typeof useRecorder>['state']
  error: string | null
  onStart: () => void
  onStop: () => void
  onReset: () => void
}

export function RecordBar({ state, error, onStart, onStop, onReset }: RecordBarProps) {
  return (
    <div className="record-bar">
      {state === 'idle' && (
        <button className="primary-button" onClick={onStart} type="button">
          <Icon name="play" size={15} /> Nagraj i oceń
        </button>
      )}
      {state === 'recording' && (
        <button className="stop-button" onClick={onStop} type="button">
          <Icon name="pause" size={15} /> Zatrzymaj
          <span className="record-indicator record-indicator--inline" />
        </button>
      )}
      {state === 'grading' && (
        <span className="translator-status">
          <span className="spinner" /> Ocenianie…
        </span>
      )}
      {state === 'error' && (
        <span className="translator-status translator-status--error">
          <Icon name="info" size={16} /> {error}
        </span>
      )}
      {(state === 'graded' || state === 'error') && (
        <button className="back-button" onClick={onReset} style={{ marginLeft: 'auto' }} type="button">
          Nagraj ponownie
        </button>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { gestureMap, type Gesture, type Phrase } from '../../data/mockLearning'
import { useRecorder } from '../../hooks/useRecorder'
import { useGestureVideos } from '../../hooks/useGestureVideos'
import { VersionedGesturePlayer } from './GestureVideoPlayer'
import { GradePanel } from './GradePanel'
import { RecordBar } from './GesturePractice'
import { GesturePractice, WebcamPane } from './GesturePractice'

type Props = { phrase: Phrase; onBack: () => void }

export function PhrasePractice({ phrase, onBack }: Props) {
  const expectedGlosses = phrase.gestureIds.map(id => gestureMap[id]?.gloss ?? '?')
  const { state, result, error, start, stop, reset } = useRecorder(expectedGlosses)
  const { versions } = useGestureVideos()

  const [showGestures, setShowGestures] = useState(false)
  const [drillGesture, setDrillGesture] = useState<Gesture | null>(null)
  const [refIdx, setRefIdx]             = useState(0)

  // Collect all per-gesture video sets for the phrase
  const gestureVersionSets = phrase.gestureIds.map(gid => {
    const gloss = gestureMap[gid]?.gloss ?? ''
    return versions[gloss.toUpperCase().trim()] ?? []
  })
  const hasAnyVideo = gestureVersionSets.some(vs => vs.length > 0)

  if (drillGesture) {
    return <GesturePractice gesture={drillGesture} onBack={() => setDrillGesture(null)} />
  }

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wróć
      </button>

      <header className="learn-header practice-header">
        <h2>{phrase.translation}</h2>
        <div className="phrase-gestures" style={{ marginTop: 8 }}>
          {expectedGlosses.map((g, i) => (
            <span key={i} className="phrase-gesture-chip">{g}</span>
          ))}
        </div>
      </header>

      <div className="practice-split">
        {/* Reference: step through gesture videos */}
        <div className="practice-pane">
          <span className="practice-pane__label">
            Wzór
            {hasAnyVideo && (
              <span className="phrase-ref-nav">
                <button className="version-btn" disabled={refIdx === 0}
                  onClick={() => setRefIdx(i => i - 1)} type="button">
                  <Icon name="arrow" size={12} style={{ transform: 'rotate(180deg)' } as React.CSSProperties} />
                </button>
                <span>{gestureMap[phrase.gestureIds[refIdx]]?.gloss}</span>
                <button className="version-btn" disabled={refIdx === phrase.gestureIds.length - 1}
                  onClick={() => setRefIdx(i => i + 1)} type="button">
                  <Icon name="arrow" size={12} />
                </button>
              </span>
            )}
          </span>
          <div className="practice-pane__media">
            {gestureVersionSets[refIdx]?.length > 0
              ? <VersionedGesturePlayer versions={gestureVersionSets[refIdx]} className="practice-video" />
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

      {/* Gesture breakdown */}
      <button
        className={`group-toggle${showGestures ? ' group-toggle--active' : ''}`}
        style={{ marginTop: 16 }}
        onClick={() => setShowGestures(v => !v)}
        type="button"
      >
        <Icon name="dashboard" size={15} />
        {showGestures ? 'Ukryj gesty' : 'Pokaż gesty osobno'}
      </button>

      {showGestures && (
        <div className="gesture-grid" style={{ marginTop: 14 }}>
          {phrase.gestureIds.map((gid, i) => {
            const g = gestureMap[gid]
            if (!g) return null
            const vids = gestureVersionSets[i]
            return (
              <button key={i} className="gesture-card gesture-card--btn"
                onClick={() => setDrillGesture(g)} type="button">
                <div className="gesture-video-placeholder">
                  {vids.length > 0
                    ? <VersionedGesturePlayer versions={vids} className="gesture-video-placeholder" />
                    : <span><Icon name="play" size={20} /></span>
                  }
                </div>
                <span className="gesture-gloss">{g.gloss}</span>
              </button>
            )
          })}
        </div>
      )}

      <RecordBar state={state} error={error} onStart={start} onStop={stop} onReset={reset} />

      {result && <GradePanel result={result} expectedGlosses={expectedGlosses} />}
    </main>
  )
}


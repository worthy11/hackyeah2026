import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { StaticAvatar } from '../../avatar/StaticAvatar'
import type { Gesture } from '../../data/mockLearning'

type Props = {
  gesture: Gesture
  onBack: () => void
}

export function GesturePractice({ gesture, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Score will be filled in by the classifier later
  const score: number | null = null

  async function startCamera() {
    const video = videoRef.current
    if (!video) return
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setCameraActive(true)
    } catch {
      setCameraError('Brak dostępu do kamery.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) { video.srcObject = null }
    setCameraActive(false)
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wróć
      </button>

      <header className="learn-header practice-header">
        <span className="eyebrow eyebrow--green">Ćwiczenie</span>
        <h2>{gesture.gloss}</h2>
        <p>Odwzoruj gest widoczny po lewej stronie</p>
      </header>

      <div className="practice-stage">
        {/* Avatar pane */}
        <div className="practice-pane practice-pane--avatar">
          <span className="practice-pane-label">Wzór</span>
          <div className="practice-avatar-wrap">
            <StaticAvatar />
          </div>
        </div>

        {/* Camera pane */}
        <div className="practice-pane practice-pane--cam">
          <div className="practice-pane-label-row">
            <span className="practice-pane-label">Twoja kamera</span>
            {cameraActive && (
              <button
                className="cam-stop-button"
                type="button"
                onClick={stopCamera}
                title="Wyłącz kamerę"
              >
                ✕ Wyłącz
              </button>
            )}
          </div>
          <div className="practice-cam-wrap">
            <video
              ref={videoRef}
              className="practice-video"
              playsInline
              muted
            />
            {!cameraActive && (
              <div className="practice-cam-overlay">
                {cameraError
                  ? <p className="practice-cam-error">{cameraError}</p>
                  : null}
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void startCamera()}
                >
                  Włącz kamerę
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accuracy score */}
      <div className="practice-score-row">
        <div className="practice-score-badge">
          {score !== null
            ? (
              <>
                <span className="practice-score-value">{score}%</span>
                <span className="practice-score-label">zgodności</span>
              </>
            )
            : (
              <>
                <span className="practice-score-value practice-score-value--empty">—</span>
                <span className="practice-score-label">Pokaż gest przed kamerą</span>
              </>
            )}
        </div>
      </div>
    </main>
  )
}

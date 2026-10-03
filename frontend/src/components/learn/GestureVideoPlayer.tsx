import { useEffect, useRef, useState } from 'react'
import type { GestureVideo } from '../../hooks/useGestureVideos'
import { Icon } from '../Icon'

type Props = {
  video: GestureVideo
  className?: string
  autoPlay?: boolean
  loop?: boolean
}

/**
 * Plays a gesture video, optionally restricted to [start_ms, end_ms].
 * If no time range is set, behaves like a normal looping video.
 */
export function GestureVideoPlayer({ video, className = '', autoPlay = true, loop = true }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const { start_ms, end_ms } = video

  useEffect(() => {
    const el = ref.current
    if (!el || start_ms == null) return
    const startSec = start_ms / 1000
    el.currentTime = startSec

    function onTimeUpdate() {
      if (!el || end_ms == null) return
      if (el.currentTime >= end_ms / 1000) {
        if (loop) { el.currentTime = startSec }
        else { el.pause() }
      }
    }

    el.addEventListener('timeupdate', onTimeUpdate)
    return () => el.removeEventListener('timeupdate', onTimeUpdate)
  }, [start_ms, end_ms, loop])

  return (
    <video
      ref={ref}
      className={className}
      src={video.video_url}
      autoPlay={autoPlay}
      muted
      playsInline
      loop={start_ms == null && loop}
    />
  )
}

// ── Version-aware wrapper ─────────────────────────────────────────────────────

type VersionedProps = {
  versions: GestureVideo[]
  className?: string
}

export function VersionedGesturePlayer({ versions, className = '' }: VersionedProps) {
  const [idx, setIdx] = useState(0)
  const current = versions[idx]
  if (!current) return null

  return (
    <div className="versioned-player">
      <GestureVideoPlayer video={current} className={className} />
      {versions.length > 1 && (
        <div className="version-switcher">
          <button
            className="version-btn"
            disabled={idx === 0}
            onClick={() => setIdx(i => i - 1)}
            type="button"
          >
            <Icon name="arrow" size={13} style={{ transform: 'rotate(180deg)' } as React.CSSProperties} />
          </button>
          <span>{idx + 1} / {versions.length}</span>
          <button
            className="version-btn"
            disabled={idx === versions.length - 1}
            onClick={() => setIdx(i => i + 1)}
            type="button"
          >
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

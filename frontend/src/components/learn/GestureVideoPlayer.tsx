import { useEffect, useRef, useState } from 'react'
import type { GestureVideo } from '../../hooks/useGestureVideos'
import { Icon } from '../Icon'

type Props = {
  video: GestureVideo
  className?: string
  autoPlay?: boolean
  loop?: boolean
  playbackRate?: number
}

/**
 * Plays a gesture video, optionally restricted to [start_ms, end_ms].
 * If no time range is set, behaves like a normal looping video.
 */
export function GestureVideoPlayer({
  video,
  className = '',
  autoPlay = true,
  loop = true,
  playbackRate = 1,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const { start_ms, end_ms } = video

  useEffect(() => {
    const el = ref.current
    if (!el) return
    try { el.playbackRate = playbackRate } catch { /* ignore unsupported rates */ }
  }, [playbackRate])

  // Clean teardown — avoids decoder / GPU leaks that can crash the tab
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.src = video.video_url
    el.load()
    if (autoPlay) void el.play().catch(() => {})

    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }, [video.video_url, autoPlay])

  useEffect(() => {
    const el = ref.current
    if (!el || start_ms == null) return
    const startSec = start_ms / 1000
    const endSec = end_ms == null ? null : end_ms / 1000

    const seekToStart = () => {
      if (Math.abs(el.currentTime - startSec) > 0.05) el.currentTime = startSec
    }
    seekToStart()

    function onTimeUpdate() {
      if (endSec == null) return
      if (el.currentTime >= endSec) {
        if (loop) seekToStart()
        else el.pause()
      }
    }

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', seekToStart)
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', seekToStart)
    }
  }, [start_ms, end_ms, loop, video.video_url])

  return (
    <video
      ref={ref}
      className={className}
      muted
      playsInline
      preload="auto"
      loop={start_ms == null && loop}
    />
  )
}

// ── Version-aware wrapper ─────────────────────────────────────────────────────

type VersionedProps = {
  versions: GestureVideo[]
  className?: string
  playbackRate?: number
}

export function VersionedGesturePlayer({ versions, className = '', playbackRate = 1 }: VersionedProps) {
  const [idx, setIdx] = useState(0)
  const safeIdx = Math.min(idx, Math.max(0, versions.length - 1))
  const current = versions[safeIdx]
  if (!current) return null

  return (
    <div className="versioned-player">
      <GestureVideoPlayer
        key={current.id + ':' + current.video_url}
        video={current}
        className={className}
        playbackRate={playbackRate}
      />
      {versions.length > 1 && (
        <div className="version-switcher">
          <button
            className="version-btn"
            disabled={safeIdx === 0}
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            type="button"
          >
            <Icon name="arrow" size={13} />
          </button>
          <span>{safeIdx + 1} / {versions.length}</span>
          <button
            className="version-btn"
            disabled={safeIdx === versions.length - 1}
            onClick={() => setIdx(i => Math.min(versions.length - 1, i + 1))}
            type="button"
          >
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Playback-speed control for reference clips. */
export function TempoAdjuster({
  value,
  onChange,
}: {
  value: number
  onChange: (rate: number) => void
}) {
  return (
    <label className="tempo-adjuster" title="Tempo odtwarzania wzoru">
      <span className="tempo-adjuster__label">Tempo</span>
      <input
        className="tempo-adjuster__range"
        type="range"
        min={0.5}
        max={1.5}
        step={0.25}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="tempo-adjuster__value">{value}×</span>
    </label>
  )
}

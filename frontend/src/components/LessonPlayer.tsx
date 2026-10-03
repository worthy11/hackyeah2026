import { useState } from 'react'
import { Icon } from './Icon'
import { SigningAvatar } from './SigningAvatar'

export function LessonPlayer() {
  const [playing, setPlaying] = useState(false)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [slow, setSlow] = useState(false)

  return (
    <section aria-label="Odtwarzacz lekcji" className="lesson-player">
      <div className="player-stage">
        <div className="player-label"><span className="status-dot" /> Avatar PJM</div>
        <button
          aria-pressed={captionsOn}
          className="caption-toggle"
          onClick={() => setCaptionsOn(!captionsOn)}
          type="button"
        >
          Napisy {captionsOn ? 'włączone' : 'wyłączone'}
        </button>
        <SigningAvatar />
        {captionsOn && <div className="caption-line">Cześć, mam na imię Anna.</div>}
      </div>

      <div className="playback-controls">
        <div className="playback-actions">
          <button className="text-control" onClick={() => setPlaying(false)} type="button">
            <Icon name="repeat" size={18} /> Powtórz
          </button>
          <button aria-pressed={slow} className="text-control" onClick={() => setSlow(!slow)} type="button">
            <Icon name="slow" size={18} /> {slow ? 'Normalne tempo' : 'Wolniej'}
          </button>
          <span className="playback-speed">{slow ? '0,75×' : '1×'}</span>
        </div>
        <div className="timeline">
          <button
            aria-label={playing ? 'Wstrzymaj' : 'Odtwórz'}
            className="play-button"
            onClick={() => setPlaying(!playing)}
            type="button"
          >
            <Icon name={playing ? 'pause' : 'play'} size={17} />
          </button>
          <div aria-label="Postęp nagrania" className="timeline-track"><span /></div>
          <span className="timecode">0:18 <span>/</span> 0:42</span>
        </div>
      </div>
    </section>
  )
}
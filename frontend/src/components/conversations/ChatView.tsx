import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { ConversationAvatar } from '../../avatar/ConversationAvatar'
import { useRecorder } from '../../hooks/useRecorder'
import type { ConversationMeta } from './ConversationsView'

// ── Conversation script ───────────────────────────────────────────────────────
//
// Step 0 – intro:            user presses Start
// Step 1 – user_greet:       user signs greeting → wait 3s after result → clip 1
// Step 2 – avatar_question:  same MP+mirror path as studio, from recorded webm @ 1.5×
// Step 3 – user_name:        user signs name → wait 3s after result
// Step 4 – avatar_meet:      same sample (until a second clip exists)
// Step 5 – wrap:             stay open (idle avatar) — no auto end
const SIGN_VIDEO = '/avatar-sample-1.webm'
const SIGN_PLAYBACK_RATE = 1.5

const AFTER_RESULT_DELAY_MS = 3000

type Step = 'intro' | 'user_greet' | 'avatar_question' | 'user_name' | 'avatar_meet' | 'wrap'
const STEPS: Step[] = ['intro', 'user_greet', 'avatar_question', 'user_name', 'avatar_meet', 'wrap']

type Props = { chat: ConversationMeta; onBack: () => void }

export function ChatView({ chat, onBack }: Props) {
  const [step, setStep] = useState<Step>('intro')

  function goTo(next: Step) { setStep(next) }

  const isAvatarTurn = step === 'avatar_question' || step === 'avatar_meet'
  const signVideoUrl = isAvatarTurn ? SIGN_VIDEO : null

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} /> Wróć do rozmów
      </button>

      <header className="learn-header practice-header">
        <h2>{chat.title}</h2>
      </header>

      <div className="chat-progress">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`chat-dot${step === s ? ' chat-dot--active' : i < STEPS.indexOf(step) ? ' chat-dot--done' : ''}`}
          />
        ))}
      </div>

      <div className="practice-split">
        {/* Left: avatar */}
        <div className="practice-pane">
          <span className="practice-pane__label">Awatar</span>
          <div className="practice-pane__media">
            <ConversationAvatar
              signing={isAvatarTurn}
              signVideoUrl={signVideoUrl}
              playbackRate={SIGN_PLAYBACK_RATE}
              onSigningDone={() => goTo(step === 'avatar_question' ? 'user_name' : 'wrap')}
            />
          </div>
          <div className="chat-controls">
            {isAvatarTurn && (
              <span className="translator-status">
                <span className="signing-dot" /><span className="signing-dot" /><span className="signing-dot" />
                Miga…
              </span>
            )}
            {!isAvatarTurn && step !== 'intro' && (
              <span className="translator-status" style={{ color: 'var(--green)' }}>Czeka…</span>
            )}
            {(isAvatarTurn || step === 'wrap') && (
              <>
                <div className="gloss-chips" style={{ justifyContent: 'center' }}>
                  {['CZEŚĆ', 'MIŁO', 'TY', 'POZNAĆ'].map(g => (
                    <span key={g} className="phrase-gesture-chip live-gloss-chip">{g}</span>
                  ))}
                </div>
                <p className="chat-recognized">
                  Tłumaczenie: <strong>Cześć, miło cię poznać</strong>
                </p>
              </>
            )}
          </div>
        </div>

        {/* Right: user */}
        <div className="practice-pane">
          <span className="practice-pane__label">Twoja kolej</span>

          {step === 'intro' && (
            <div className="practice-pane__media chat-pane-center">
              <button className="primary-button" onClick={() => goTo('user_greet')} type="button">
                <Icon name="play" size={15} /> Zacznij
              </button>
            </div>
          )}

          {step === 'user_greet' && (
            <UserRecordPanel onDone={() => goTo('avatar_question')} />
          )}

          {(step === 'avatar_question' || step === 'avatar_meet') && (
            <div className="practice-pane__media chat-pane-center">
              <p className="chat-recognized">Poczekaj, aż awatar skończy migać.</p>
            </div>
          )}

          {step === 'user_name' && (
            <UserRecordPanel onDone={() => goTo('avatar_meet')} />
          )}

          {step === 'wrap' && (
            <div className="practice-pane__media chat-pane-center">
              <p className="chat-recognized">Możesz wrócić do listy rozmów.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}


// ── Record turn — auto-advance 3s after recognition/translation arrives ───────

function UserRecordPanel({ onDone }: { onDone: () => void }) {
  const { state, result, error, videoRef, start, stop } = useRecorder([], { preview: true })
  const recording = state === 'recording'
  const [countdown, setCountdown] = useState<number | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    if (!result) {
      setCountdown(null)
      return
    }
    setCountdown(AFTER_RESULT_DELAY_MS / 1000)
    const started = Date.now()
    const tick = setInterval(() => {
      const left = Math.ceil((AFTER_RESULT_DELAY_MS - (Date.now() - started)) / 1000)
      setCountdown(Math.max(0, left))
    }, 200)
    const done = setTimeout(() => {
      clearInterval(tick)
      onDoneRef.current()
    }, AFTER_RESULT_DELAY_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(done)
    }
  }, [result])

  return (
    <>
      <div className="practice-pane__media">
        <video
          ref={videoRef}
          className="practice-video practice-video--mirror"
          muted
          playsInline
        />
        {recording && <span className="record-indicator" />}
      </div>

      <div className="chat-controls">
        {state === 'idle' && (
          <button className="primary-button" onClick={start} type="button">
            <Icon name="play" size={15} /> Nagraj
          </button>
        )}
        {state === 'recording' && (
          <button className="stop-button" onClick={stop} type="button">
            <Icon name="pause" size={15} /> Zatrzymaj
            <span className="record-indicator record-indicator--inline" />
          </button>
        )}
        {state === 'grading' && (
          <span className="translator-status"><span className="spinner" /> Rozpoznawanie…</span>
        )}
        {state === 'error' && (
          <span className="translator-status translator-status--error">
            <Icon name="info" size={16} /> {error}
          </span>
        )}

        {result && (
          <>
            {result.glosses.length > 0 && (
              <p className="chat-recognized">
                Rozpoznano: <strong>{result.glosses.join(' ')}</strong>
              </p>
            )}
            {result.translation && (
              <p className="chat-recognized">
                Tłumaczenie: <strong>{result.translation}</strong>
              </p>
            )}
            {countdown != null && (
              <span className="translator-status">
                Awatar odpowie za {countdown}s…
              </span>
            )}
          </>
        )}
      </div>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { ConversationAvatar } from '../../avatar/ConversationAvatar'
import { useRecorder } from '../../hooks/useRecorder'
import type { ConversationMeta } from './ConversationsView'

const SIGN_LANDMARKS = '/avatar-sample-1.json'
const SIGN_PLAYBACK_RATE = 1

const AVATAR_GLOSSES = ['CZEŚĆ', 'JAK-SIĘ-MASZ']
const AVATAR_TRANSLATION = 'Cześć, jak się masz?'
const GLOSS_STREAM_MS = 1100
const TRANSLATION_AFTER_MS = 450

const AFTER_RESULT_DELAY_MS = 3000

type Step = 'intro' | 'user_greet' | 'avatar_question' | 'user_name' | 'avatar_meet' | 'wrap'
const STEPS: Step[] = ['intro', 'user_greet', 'avatar_question', 'user_name', 'avatar_meet', 'wrap']

type Props = { chat: ConversationMeta; onBack: () => void }

export function ChatView({ chat, onBack }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const stepRef = useRef(step)
  useEffect(() => { stepRef.current = step }, [step])

  function goTo(next: Step) { setStep(next) }

  const isAvatarTurn = step === 'avatar_question' || step === 'avatar_meet'
  const { glosses, translation, streaming } = useAvatarCaption(isAvatarTurn)
  const showCaption = glosses.length > 0 || !!translation || streaming

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
        <div className="practice-pane">
          <span className="practice-pane__label">Awatar</span>
          <div className="practice-pane__media">
            <ConversationAvatar
              signing={isAvatarTurn}
              landmarksUrl={isAvatarTurn ? SIGN_LANDMARKS : null}
              loadTrackers={false}
              playbackRate={SIGN_PLAYBACK_RATE}
              onSigningDone={() => {
                const s = stepRef.current
                goTo(s === 'avatar_question' ? 'user_name' : 'wrap')
              }}
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
            {showCaption && (
              <>
                {glosses.length > 0 && (
                  <div className="gloss-chips" style={{ justifyContent: 'center' }}>
                    {glosses.map(g => (
                      <span key={g} className="phrase-gesture-chip live-gloss-chip">{g}</span>
                    ))}
                    {streaming && <span className="spinner" style={{ marginLeft: 4 }} />}
                  </div>
                )}
                {translation && (
                  <p className="chat-recognized">
                    Tłumaczenie: <strong>{translation}</strong>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="practice-pane">
          <span className="practice-pane__label">Twoja kolej</span>

          {step === 'intro' && (
            <div className="practice-pane__media chat-pane-center">
              <button className="primary-button" onClick={() => goTo('user_greet')} type="button">
                <Icon name="play" size={15} /> Zacznij
              </button>
            </div>
          )}

          {step !== 'intro' && (
            <UserRecordPanel
              demoKey="CZEŚĆ"
              mode={isAvatarTurn ? 'waiting' : step === 'wrap' ? 'done' : 'record'}
              turnKey={step === 'user_name' || step === 'avatar_meet' || step === 'wrap' ? 'name' : 'greet'}
              onDone={() => {
                const s = stepRef.current
                goTo(s === 'user_greet' ? 'avatar_question' : 'avatar_meet')
              }}
            />
          )}
        </div>
      </div>
    </main>
  )
}

/** Stream glosses one-by-one while the avatar is signing; keep final caption afterward. */
function useAvatarCaption(signing: boolean) {
  const [glosses, setGlosses] = useState<string[]>([])
  const [translation, setTranslation] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const finalRef = useRef<{ glosses: string[]; translation: string } | null>(null)
  const runRef = useRef(0)

  useEffect(() => {
    if (!signing) {
      // Keep last completed caption for wrap / between turns
      if (finalRef.current) {
        setGlosses(finalRef.current.glosses)
        setTranslation(finalRef.current.translation)
      }
      setStreaming(false)
      return
    }

    const run = ++runRef.current
    setGlosses([])
    setTranslation(null)
    setStreaming(true)
    const timers: number[] = []
    const shown: string[] = []

    AVATAR_GLOSSES.forEach((g, i) => {
      timers.push(window.setTimeout(() => {
        if (runRef.current !== run) return
        shown.push(g)
        setGlosses([...shown])
      }, 400 + i * GLOSS_STREAM_MS))
    })

    timers.push(window.setTimeout(() => {
      if (runRef.current !== run) return
      setTranslation(AVATAR_TRANSLATION)
      setStreaming(false)
      finalRef.current = { glosses: [...AVATAR_GLOSSES], translation: AVATAR_TRANSLATION }
    }, 400 + AVATAR_GLOSSES.length * GLOSS_STREAM_MS + TRANSLATION_AFTER_MS))

    return () => timers.forEach(clearTimeout)
  }, [signing])

  return { glosses, translation, streaming }
}

function UserRecordPanel({
  onDone,
  demoKey = 'CZEŚĆ',
  mode = 'record',
  turnKey = 'greet',
}: {
  onDone: () => void
  demoKey?: string
  mode?: 'record' | 'waiting' | 'done'
  turnKey?: string
}) {
  const { state, result, error, videoRef, start, stop, reset } = useRecorder([], { preview: true, demoKey })
  const recording = state === 'recording'
  const [countdown, setCountdown] = useState<number | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  // New user turn → clear previous result; stay mounted so the camera never drops.
  useEffect(() => {
    if (mode === 'record') reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, turnKey])

  useEffect(() => {
    if (!result || mode !== 'record') {
      setCountdown(null)
      return
    }
    setCountdown(AFTER_RESULT_DELAY_MS / 1000)
    const started = Date.now()
    const tick = setInterval(() => {
      const left = Math.ceil((AFTER_RESULT_DELAY_MS - (Date.now() - started)) / 1000)
      setCountdown(Math.max(0, left))
    }, 250)
    const done = setTimeout(() => {
      clearInterval(tick)
      onDoneRef.current()
    }, AFTER_RESULT_DELAY_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(done)
    }
  }, [result, mode])

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
        {mode === 'waiting' && (
          <span className="translator-status">Poczekaj, aż awatar skończy migać.</span>
        )}
        {mode === 'done' && (
          <p className="chat-recognized">Możesz wrócić do listy rozmów.</p>
        )}

        {mode === 'record' && state === 'idle' && (
          <button className="primary-button" onClick={start} type="button">
            <Icon name="play" size={15} /> Nagraj
          </button>
        )}
        {mode === 'record' && state === 'recording' && (
          <button className="stop-button" onClick={stop} type="button">
            <Icon name="pause" size={15} /> Zatrzymaj
            <span className="record-indicator record-indicator--inline" />
          </button>
        )}
        {mode === 'record' && state === 'grading' && (
          <span className="translator-status"><span className="spinner" /> Rozpoznawanie…</span>
        )}
        {mode === 'record' && state === 'error' && (
          <span className="translator-status translator-status--error">
            <Icon name="info" size={16} /> {error}
          </span>
        )}

        {result && mode !== 'done' && (
          <>
            {result.glosses.length > 0 && (
              <p className="chat-recognized">
                Transkrypcja: <strong>{result.glosses.join(' ')}</strong>
              </p>
            )}
            {result.translation && (
              <p className="chat-recognized">
                Tłumaczenie: <strong>{result.translation}</strong>
              </p>
            )}
            {mode === 'record' && countdown != null && (
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

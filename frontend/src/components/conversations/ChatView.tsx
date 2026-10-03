import { useState } from 'react'
import { Icon } from '../Icon'
import { ConversationAvatar } from '../../avatar/ConversationAvatar'
import { useRecorder } from '../../hooks/useRecorder'
import { GradePanel } from '../learn/GradePanel'
import type { ConversationMeta } from './ConversationsView'

// ── Conversation script ───────────────────────────────────────────────────────
//
// Step 0 – intro:            user presses Start
// Step 1 – user_greet:       user zamigaj CZEŚĆ  (graded)
// Step 2 – avatar_question:  avatar zamigaj "Cześć, jak masz na imię?"
// Step 3 – user_name:        user zamigaj name  (any gesture)
// Step 4 – avatar_meet:      avatar zamigaj "Miło mi cię poznać, ___"
// Step 5 – done
//
// Set these to landmark URLs once gesture videos are processed.
const LANDMARKS = {
  question: null as string | null,  // TODO: '/media/landmarks/XX.json'
  meet:     null as string | null,  // TODO: '/media/landmarks/YY.json'
}

type Step = 'intro' | 'user_greet' | 'avatar_question' | 'user_name' | 'avatar_meet' | 'done'
const STEPS: Step[] = ['intro', 'user_greet', 'avatar_question', 'user_name', 'avatar_meet', 'done']

type Props = { chat: ConversationMeta; onBack: () => void }

export function ChatView({ chat, onBack }: Props) {
  const [step, setStep]         = useState<Step>('intro')
  const [userName, setUserName] = useState('')

  function goTo(next: Step) { setStep(next) }

  const isAvatarTurn    = step === 'avatar_question' || step === 'avatar_meet'
  const avatarLandmarks = step === 'avatar_question' ? LANDMARKS.question : LANDMARKS.meet
  const avatarDuration  = step === 'avatar_question' ? 3000 : 3500

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} /> Wróć do rozmów
      </button>

      <header className="learn-header practice-header">
        <h2>{chat.title}</h2>
      </header>

      {/* Progress */}
      <div className="chat-progress">
        {STEPS.map((s, i) => (
          <span key={s} className={`chat-dot${step === s ? ' chat-dot--active' : i < STEPS.indexOf(step) ? ' chat-dot--done' : ''}`} />
        ))}
      </div>

      {step === 'done' ? (
        <DoneStep onRestart={() => goTo('intro')} onBack={onBack} />
      ) : (
        <div className="practice-split">
          {/* Left: avatar — always mounted, signing prop drives animation */}
          <div className="practice-pane">
            <span className="practice-pane__label">Awatar</span>
            <div className="practice-pane__media">
              <ConversationAvatar
                signing={isAvatarTurn}
                durationMs={avatarDuration}
                landmarksUrl={avatarLandmarks}
                onSigningDone={() => goTo(step === 'avatar_question' ? 'user_name' : 'done')}
              />
            </div>
            {isAvatarTurn && (
              <span className="practice-pane__label" style={{ justifyContent: 'center', marginTop: 4 }}>
                <span className="signing-dot" /><span className="signing-dot" /><span className="signing-dot" />
              </span>
            )}
            {!isAvatarTurn && step !== 'intro' && (
              <span className="practice-pane__label" style={{ justifyContent: 'center', color: 'var(--green)' }}>
                Słucha…
              </span>
            )}
          </div>

          {/* Right: user turn */}
          <div className="practice-pane">
            <span className="practice-pane__label">Twoja kolej</span>
            <div className="practice-pane__media chat-right-pane">

              {step === 'intro' && (
                <div className="chat-step chat-step--intro">
                  <div className="chat-bubble chat-bubble--avatar">
                    <p>Awatar cię przywita. Zamigaj <strong>CZEŚĆ</strong> w odpowiedzi.</p>
                  </div>
                  <button className="primary-button" onClick={() => goTo('user_greet')} type="button">
                    <Icon name="play" size={15} /> Zacznij
                  </button>
                </div>
              )}

              {step === 'user_greet' && (
                <UserGreetPanel onDone={() => goTo('avatar_question')} />
              )}

              {step === 'avatar_question' && (
                <div className="chat-step">
                  <div className="chat-bubble chat-bubble--avatar">
                    <p>Awatar pyta o twoje imię — poczekaj, aż skończy migać.</p>
                  </div>
                </div>
              )}

              {step === 'user_name' && (
                <UserNamePanel onDone={(name) => { setUserName(name); goTo('avatar_meet') }} />
              )}

              {step === 'avatar_meet' && (
                <div className="chat-step">
                  <div className="chat-bubble chat-bubble--avatar">
                    <p>Awatar się z tobą wita!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}


// ── User greet step ───────────────────────────────────────────────────────────

function UserGreetPanel({ onDone }: { onDone: () => void }) {
  const { state, result, error, start, stop, reset } = useRecorder(['CZEŚĆ'])
  const passed = result && result.score >= 50

  return (
    <div className="chat-step">
      <div className="chat-bubble chat-bubble--user">
        <p>Zamigaj <strong>CZEŚĆ</strong></p>
      </div>
      <RecordControls state={state} error={error} onStart={start} onStop={stop} />
      {result && <GradePanel result={result} expectedGlosses={['CZEŚĆ']} />}
      {result && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {!passed && <button className="back-button" onClick={reset} type="button">Spróbuj ponownie</button>}
          <button className="primary-button" onClick={onDone} type="button">
            {passed ? 'Dalej' : 'Pomiń'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── User name step ────────────────────────────────────────────────────────────

function UserNamePanel({ onDone }: { onDone: (name: string) => void }) {
  const { state, result, error, start, stop } = useRecorder([])

  return (
    <div className="chat-step">
      <div className="chat-bubble chat-bubble--user">
        <p>Zamigaj swoje imię</p>
      </div>
      <RecordControls state={state} error={error} onStart={start} onStop={stop} />
      {result && (
        <div style={{ marginTop: 10 }}>
          {result.glosses.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
              Rozpoznano: <strong>{result.glosses.join(' ')}</strong>
            </p>
          )}
          <button className="primary-button" onClick={() => onDone(result.glosses[0] ?? 'nieznajomy')} type="button">
            Dalej
          </button>
        </div>
      )}
    </div>
  )
}

// ── Done screen ───────────────────────────────────────────────────────────────

function DoneStep({ onRestart, onBack }: { onRestart: () => void; onBack: () => void }) {
  return (
    <div className="chat-step chat-step--done">
      <div className="contrib-success__icon"><Icon name="check" size={32} /></div>
      <h3>Rozmowa zakończona!</h3>
      <p>Udało ci się przeprowadzić pierwszą rozmowę w PJM.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button className="back-button" onClick={onRestart} type="button">Zacznij od nowa</button>
        <button className="primary-button" onClick={onBack} type="button">Wróć do listy</button>
      </div>
    </div>
  )
}

// ── Shared record controls ────────────────────────────────────────────────────

type RCProps = {
  state: ReturnType<typeof useRecorder>['state']
  error: string | null
  onStart: () => void
  onStop: () => void
}

function RecordControls({ state, error, onStart, onStop }: RCProps) {
  return (
    <div className="record-bar" style={{ marginTop: 12 }}>
      {state === 'idle' && (
        <button className="primary-button" onClick={onStart} type="button">
          <Icon name="play" size={15} /> Nagraj
        </button>
      )}
      {state === 'recording' && (
        <button className="stop-button" onClick={onStop} type="button">
          <Icon name="pause" size={15} /> Zatrzymaj
          <span className="record-indicator record-indicator--inline" />
        </button>
      )}
      {state === 'grading' && (
        <span className="translator-status"><span className="spinner" /> Ocenianie…</span>
      )}
      {state === 'error' && (
        <span className="translator-status translator-status--error">
          <Icon name="info" size={16} /> {error}
        </span>
      )}
    </div>
  )
}

import { Icon } from '../Icon'
import AvatarStage from '../../avatar/AvatarStage'
import type { Gesture } from '../../data/mockLearning'

type Props = {
  gesture: Gesture
  onBack: () => void
}

export function GesturePractice({ gesture, onBack }: Props) {
  // Score will be filled in by the classifier later
  const score: number | null = null

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wróć
      </button>

      <header className="learn-header practice-header">
        <span className="eyebrow eyebrow--green">Ćwiczenie</span>
        <h2>{gesture.gloss}</h2>
        <p>Odwzoruj gest i obserwuj awatara – śledzi Twoje ruchy w czasie rzeczywistym</p>
      </header>

      <AvatarStage />

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
                <span className="practice-score-label">Włącz kamerę, by zobaczyć wynik</span>
              </>
            )}
        </div>
      </div>
    </main>
  )
}

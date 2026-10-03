import { useState } from 'react'
import { Icon } from './Icon'
import { LearningPlan } from './LearningPlan'
import { LessonPlayer } from './LessonPlayer'

export function LessonDashboard({ onNavigate }: { onNavigate: (label: string) => void }) {
  const [practiceStarted, setPracticeStarted] = useState(false)

  return (
    <main className="dashboard">
      <section className="lesson-column">
        <div className="lesson-heading">
          <div>
            <span className="eyebrow eyebrow--green">Lekcja na dziś</span>
            <h2>Przedstawianie się</h2>
            <p>Podstawy <span className="crumb-divider">/</span> Lekcja 4</p>
          </div>
          <div className="lesson-meta"><span>6 min</span><span>Poziom początkujący</span></div>
        </div>

        <LessonPlayer />

        <section className="practice-prompt">
          <span className="prompt-icon"><Icon name="check" size={18} /></span>
          <div className="prompt-copy">
            <strong>{practiceStarted ? 'Ćwiczenie rozpoczęte' : 'Twoja kolej'}</strong>
            <span>Spróbuj wykonać znak. Możesz obejrzeć go ponownie.</span>
          </div>
          <button className="primary-button" onClick={() => setPracticeStarted(true)} type="button">
            {practiceStarted ? 'Ćwiczymy' : 'Ćwicz znak'}
          </button>
        </section>
      </section>

      <LearningPlan onNavigate={onNavigate} />
    </main>
  )
}
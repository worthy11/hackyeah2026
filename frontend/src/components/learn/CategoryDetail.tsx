import { useState } from 'react'
import { Icon } from '../Icon'
import { categoryColor, gestures, phrases, gestureMap, type Category, type Gesture, type Phrase } from '../../data/mockLearning'
import { GesturePractice } from './GesturePractice'
import { PhrasePractice } from './PhrasePractice'

type Props = { category: Category; onBack: () => void }

export function CategoryDetail({ category, onBack }: Props) {
  const [practicingGesture, setPracticingGesture] = useState<Gesture | null>(null)
  const [practicingPhrase,  setPracticingPhrase]  = useState<Phrase  | null>(null)

  const catGestures = gestures.filter(g => g.categoryId === category.id)
  const catPhrases  = phrases.filter(p => p.categoryId  === category.id)

  if (practicingGesture) return <GesturePractice gesture={practicingGesture} onBack={() => setPracticingGesture(null)} />
  if (practicingPhrase)  return <PhrasePractice  phrase={practicingPhrase}   onBack={() => setPracticingPhrase(null)} />

  return (
    <main className="learn-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wszystkie tematy
      </button>

      <header className="learn-header">
        <span
          className="category-tile__icon category-tile__icon--lg"
          style={{
            color: categoryColor(category.id).fg,
            background: categoryColor(category.id).bg,
          }}
        >
          <Icon name={category.icon} size={28} />
        </span>
        <h2>{category.name}</h2>
      </header>

      <section className="learn-section">
        <h3 className="learn-section-title">Gesty ({catGestures.length})</h3>
        <div className="gesture-grid">
          {catGestures.map(g => (
            <button
              key={g.id}
              className="gesture-card gesture-card--btn"
              onClick={() => setPracticingGesture(g)}
              type="button"
            >
              <span className="gesture-gloss">{g.gloss}</span>
              <span className="gesture-practice-hint">
                <Icon name="play" size={11} /> Ćwicz
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="learn-section">
        <h3 className="learn-section-title">Zdania ({catPhrases.length})</h3>
        <div className="phrase-list">
          {catPhrases.map(p => (
            <div key={p.id} className="phrase-card">
              <div className="phrase-card__content">
                <span className="phrase-translation">{p.translation}</span>
                <div className="phrase-gestures">
                  {p.gestureIds.map((gid, i) => (
                    <span key={i} className="phrase-gesture-chip">
                      {gestureMap[gid]?.gloss ?? '?'}
                    </span>
                  ))}
                </div>
              </div>
              <button
                className="primary-button primary-button--sm"
                onClick={() => setPracticingPhrase(p)}
                type="button"
              >
                <Icon name="play" size={14} /> Ćwicz
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

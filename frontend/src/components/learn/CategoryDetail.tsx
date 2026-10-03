import { Icon } from '../Icon'
import { gestures, phrases, gestureMap, type Category } from '../../data/mockLearning'

type Props = { category: Category; onBack: () => void }

export function CategoryDetail({ category, onBack }: Props) {
  const catGestures = gestures.filter(g => g.categoryId === category.id)
  const catPhrases  = phrases.filter(p => p.categoryId  === category.id)

  return (
    <main className="learn-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} />
        Wszystkie tematy
      </button>

      <header className="learn-header">
        <span className="category-tile__icon category-tile__icon--lg">
          <Icon name={category.icon} size={28} />
        </span>
        <h2>{category.name}</h2>
        <p>{category.description}</p>
      </header>

      <section className="learn-section">
        <h3 className="learn-section-title">Gesty ({catGestures.length})</h3>
        <div className="gesture-grid">
          {catGestures.map(g => (
            <div key={g.id} className="gesture-card">
              <div className="gesture-video-placeholder">
                {g.videoPath
                  ? <video src={g.videoPath} loop muted playsInline />
                  : <span><Icon name="play" size={24} /></span>
                }
              </div>
              <span className="gesture-gloss">{g.gloss}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="learn-section">
        <h3 className="learn-section-title">Frazy ({catPhrases.length})</h3>
        <div className="phrase-list">
          {catPhrases.map(p => (
            <div key={p.id} className="phrase-card">
              <span className="phrase-translation">{p.translation}</span>
              <div className="phrase-gestures">
                {p.gestureIds.map((gid, i) => (
                  <span key={i} className="phrase-gesture-chip">
                    {gestureMap[gid]?.gloss ?? '?'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

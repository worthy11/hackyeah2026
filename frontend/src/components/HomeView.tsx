import { Icon } from './Icon'
import { useUser } from '../context/UserContext'
import { categories, categoryColor, gestureMap, type Gesture } from '../data/mockLearning'

// Mock recent practice — any number of gestures, but from at most 3 categories
const recentGestureIds = [101, 104, 201, 203, 401, 501, 303]
const recentGestures = (() => {
  const cats = new Set<number>()
  const out: Gesture[] = []
  for (const id of recentGestureIds) {
    const g = gestureMap[id]
    if (!g) continue
    if (!cats.has(g.categoryId) && cats.size >= 3) continue
    cats.add(g.categoryId)
    out.push(g)
  }
  return out
})()
const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]))

type Props = { onNavigate: (item: string) => void; onPractice: (gesture: Gesture) => void }

export function HomeView({ onNavigate, onPractice }: Props) {
  const { user } = useUser()
  const firstName = user.name.split(' ')[0]

  return (
    <main className="home-view">
      <header className="home-title">
        <h1>Dzień dobry, {firstName}</h1>
        <p>Co dziś zamigasz?</p>
      </header>

      {/* Hero tiles */}
      <section className="home-hero">
        <button
          className="hero-tile hero-tile--primary"
          onClick={() => onNavigate('Tłumacz')}
          type="button"
        >
          <span className="hero-tile__icon">
            <Icon name="translate" size={28} />
          </span>
          <span className="hero-tile__body">
            <strong>Tłumacz</strong>
            <span>Nagraj lub prześlij film i uzyskaj polskie tłumaczenie gestów</span>
          </span>
          <Icon name="arrow" size={20} />
        </button>

        <button
          className="hero-tile hero-tile--secondary"
          onClick={() => onNavigate('Nauka')}
          type="button"
        >
          <span className="hero-tile__icon">
            <Icon name="dashboard" size={24} />
          </span>
          <span className="hero-tile__body">
            <strong>Przeglądaj tematy</strong>
            <span>Ćwicz gesty i zdania</span>
          </span>
          <Icon name="arrow" size={20} />
        </button>
      </section>

      {/* Recently practiced */}
      <section className="home-section">
        <h3 className="home-section-title">Ostatnio ćwiczone</h3>
        <div className="gesture-grid">
          {recentGestures.map(g => {
            const cat = categoryMap[g.categoryId]
            return (
              <button
                key={g.id}
                className="gesture-card gesture-card--btn"
                type="button"
                onClick={() => onPractice(g)}
              >
                <span className="gesture-gloss">{g.gloss}</span>
                {cat && (
                  <span
                    className="gesture-category-tag"
                    style={{ color: categoryColor(cat.id).fg, background: categoryColor(cat.id).bg }}
                  >
                    <Icon name={cat.icon} size={11} />
                    {cat.name}
                  </span>
                )}
                <span className="gesture-practice-hint">
                  <Icon name="play" size={11} /> Ćwicz
                </span>
              </button>
            )
          })}
        </div>
      </section>

    </main>
  )
}

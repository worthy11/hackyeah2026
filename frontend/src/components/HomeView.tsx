import { Icon } from './Icon'
import { gestureMap, type Gesture } from '../data/mockLearning'

// Mock: last 5 gestures the user practiced
const recentGestureIds = [101, 201, 401, 501, 303, 602]
const recentGestures = recentGestureIds.map(id => gestureMap[id]).filter(Boolean)

type Props = { onNavigate: (item: string) => void; onPractice: (gesture: Gesture) => void }

export function HomeView({ onNavigate, onPractice }: Props) {
  return (
    <main className="home-view">

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
          onClick={() => onNavigate('Moja nauka')}
          type="button"
        >
          <span className="hero-tile__icon">
            <Icon name="dashboard" size={24} />
          </span>
          <span className="hero-tile__body">
            <strong>Przeglądaj tematy</strong>
            <span>Ćwicz gesty i zdania!</span>
          </span>
          <Icon name="arrow" size={20} />
        </button>
      </section>

      {/* Recently practiced */}
      <section className="home-section">
        <h3 className="home-section-title">Ostatnio ćwiczone</h3>
        <div className="gesture-grid">
          {recentGestures.map(g => (
            <button
              key={g.id}
              className="gesture-card gesture-card--btn"
              type="button"
              onClick={() => onPractice(g)}
            >
              <div className="gesture-video-placeholder">
                {g.videoPath
                  ? <video src={g.videoPath} loop muted playsInline />
                  : <span><Icon name="play" size={24} /></span>
                }
              </div>
              <span className="gesture-gloss">{g.gloss}</span>
            </button>
          ))}
        </div>
      </section>

    </main>
  )
}

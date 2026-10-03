import { Icon } from '../Icon'
import { categories, gestures, phrases, type Category } from '../../data/mockLearning'

type Props = { onSelect: (category: Category) => void }

export function CategoryGrid({ onSelect }: Props) {
  return (
    <main className="learn-view">
      <header className="learn-header">
        <span className="eyebrow eyebrow--green">Moja nauka</span>
        <h2>Wybierz temat</h2>
        <p>Ćwicz gesty i frazy pogrupowane tematycznie</p>
      </header>

      <div className="category-grid">
        {categories.map(cat => {
          const gestureCount = gestures.filter(g => g.categoryId === cat.id).length
          const phraseCount  = phrases.filter(p => p.categoryId  === cat.id).length
          return (
            <button
              key={cat.id}
              className="category-tile"
              onClick={() => onSelect(cat)}
              type="button"
            >
              <span className="category-tile__icon">
                <Icon name={cat.icon} size={22} />
              </span>
              <strong className="category-name">{cat.name}</strong>
              <span className="category-desc">{cat.description}</span>
              <span className="category-meta">
                {gestureCount} gestów · {phraseCount} fraz
              </span>
            </button>
          )
        })}
      </div>
    </main>
  )
}

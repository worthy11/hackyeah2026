import type { CSSProperties } from 'react'
import { Icon } from '../Icon'
import { categories, categoryColor, gestures, phrases, type Category } from '../../data/mockLearning'

type Props = { onSelect: (category: Category) => void }

export function CategoryGrid({ onSelect }: Props) {
  return (
    <main className="learn-view">
      <div className="category-grid">
        {[...categories].sort((a, b) => a.name.localeCompare(b.name, 'pl')).map(cat => {
          const gestureCount = gestures.filter(g => g.categoryId === cat.id).length
          const phraseCount  = phrases.filter(p => p.categoryId  === cat.id).length
          const { fg, bg } = categoryColor(cat.id)
          return (
            <button
              key={cat.id}
              className="category-tile"
              onClick={() => onSelect(cat)}
              type="button"
              style={{ '--cat-fg': fg, '--cat-bg': bg } as CSSProperties}
            >
              <span className="category-tile__icon">
                <Icon name={cat.icon} size={22} />
              </span>
              <strong className="category-name">{cat.name}</strong>
              <span className="category-desc">{cat.description}</span>
              <span className="category-meta">
                {gestureCount} gestów · {phraseCount} zdań
              </span>
            </button>
          )
        })}
      </div>
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { categories, gestures, type Gesture } from '../../data/mockLearning'
import { GesturePractice } from './GesturePractice'

export function VocabularyView() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [practicing, setPracticing] = useState<Gesture | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visible = selected.size === 0
    ? [...gestures].sort((a, b) => a.gloss.localeCompare(b.gloss, 'pl'))
    : gestures.filter(g => selected.has(g.categoryId))

  const label = selected.size === 0
    ? 'Wszystkie kategorie'
    : selected.size === 1
      ? categories.find(c => selected.has(c.id))?.name ?? ''
      : `${selected.size} kategorie`

  if (practicing) {
    return <GesturePractice gesture={practicing} onBack={() => setPracticing(null)} />
  }

  return (
    <main className="learn-view">
      {/* Dropdown filter */}
      <div className="vocab-dropdown-wrap" ref={dropdownRef}>
        <button
          className={`vocab-dropdown-trigger${open ? ' vocab-dropdown-trigger--open' : ''}`}
          onClick={() => setOpen(o => !o)}
          type="button"
        >
          <Icon name="filter" size={15} />
          <span>{label}</span>
          <Icon name="chevron" size={15} />
        </button>

        {open && (
          <div className="vocab-dropdown-menu">
            <button
              className="vocab-dropdown-clear"
              onClick={() => setSelected(new Set())}
              type="button"
            >
              Wyczyść filtry
            </button>
            {categories.map(cat => (
              <label key={cat.id} className="vocab-dropdown-item">
                <input
                  type="checkbox"
                  checked={selected.has(cat.id)}
                  onChange={() => toggle(cat.id)}
                />
                <Icon name={cat.icon} size={15} />
                {cat.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="gesture-grid">
        {visible.map(g => (
          <button
            key={g.id}
            className="gesture-card gesture-card--btn"
            type="button"
            onClick={() => setPracticing(g)}
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
    </main>
  )
}

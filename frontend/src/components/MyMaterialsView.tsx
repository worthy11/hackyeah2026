import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { GestureVideo } from '../hooks/useGestureVideos'
import { categories } from '../data/mockLearning'

function categoryName(id: number) {
  return categories.find(c => c.id === id)?.name ?? `Kategoria ${id}`
}

export function MyMaterialsView() {
  const [items, setItems]     = useState<GestureVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/contributions/gestures')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: GestureVideo[]) => { setItems(data); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  return (
    <main className="learn-view">
      {loading && (
        <div className="translator-status">
          <span className="spinner" /> Ładowanie…
        </div>
      )}

      {error && (
        <div className="translator-status translator-status--error">
          <Icon name="info" size={16} /> {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="placeholder-view" style={{ paddingTop: 40 }}>
          <Icon name="upload" size={36} />
          <p>Nie przesłano jeszcze żadnych nagrań.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="materials-grid">
          {items.map(item => (
            <div key={item.id} className="material-card">
              <div className="material-card__video">
                <video
                  src={item.video_url}
                  className="material-thumb"
                  controls
                  preload="metadata"
                />
                {item.start_ms != null && item.end_ms != null && (
                  <span className="material-badge">
                    {(item.start_ms / 1000).toFixed(1)}s – {(item.end_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="material-card__info">
                <span className="gesture-gloss">{item.gloss}</span>
                <span className="material-meta">{categoryName(item.category_id)}</span>
                {item.landmarks_url && (
                  <span className="material-landmarks">
                    <Icon name="check" size={12} /> Punkty gotowe
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

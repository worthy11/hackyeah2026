import { useEffect, useState } from 'react'

export type GestureVideo = {
  id: number
  gloss: string
  category_id: number
  video_url: string
  start_ms: number | null
  end_ms: number | null
  landmarks_url: string | null
}

// Grouped by normalised gloss → multiple contributor versions
export type GlossVersions = Record<string, GestureVideo[]>

let cache: GlossVersions | null = null

export function useGestureVideos() {
  const [versions, setVersions] = useState<GlossVersions>(cache ?? {})
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    let cancelled = false
    fetch('/api/contributions/gestures')
      .then(r => (r.ok ? r.json() : []))
      .then((data: GestureVideo[]) => {
        const grouped: GlossVersions = {}
        for (const g of data) {
          const key = g.gloss.toUpperCase().trim()
          grouped[key] = [...(grouped[key] ?? []), g]
        }
        cache = grouped
        if (!cancelled) {
          setVersions(grouped)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVersions(cache ?? {})
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  return { versions, loading }
}

export function invalidateGestureCache() {
  cache = null
}

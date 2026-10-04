import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { categories } from '../data/mockLearning'
import { invalidateGestureCache } from '../hooks/useGestureVideos'

type UploadType = 'gesture' | 'phrase'
type Status = 'idle' | 'uploading' | 'done' | 'error'

type Segment = { start_ms: number; end_ms: number; gloss: string }

export function ContributionView() {
  const [uploadType, setUploadType] = useState<UploadType>('gesture')
  const [gloss, setGloss]           = useState('')
  const [translation, setTranslation] = useState('')
  const [categoryId, setCategoryId] = useState<number>(categories[0].id)
  const [file, setFile]             = useState<File | null>(null)
  const [status, setStatus]         = useState<Status>('idle')
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<unknown | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Phrase segment markers
  const [segments, setSegments]     = useState<Segment[]>([])
  const [pendingGloss, setPendingGloss] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [markerStart, setMarkerStart] = useState<number | null>(null)
  const [videoURL, setVideoURL] = useState<string | null>(null)

  // Set video src after React renders the <video> element
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setVideoURL(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setVideoURL(null)
    }
  }, [file])

  function addMarkerStart() {
    const t = videoRef.current?.currentTime ?? 0
    setMarkerStart(t * 1000)
  }

  function addMarkerEnd() {
    if (markerStart == null || !pendingGloss.trim()) return
    const end = (videoRef.current?.currentTime ?? 0) * 1000
    if (end <= markerStart) return
    setSegments(s => [...s, { start_ms: markerStart, end_ms: end, gloss: pendingGloss.trim().toUpperCase() }])
    setMarkerStart(null)
    setPendingGloss('')
  }

  function removeSegment(i: number) {
    setSegments(s => s.filter((_, j) => j !== i))
  }

  async function submit() {
    if (!file) return
    if (uploadType === 'gesture' && !gloss.trim()) return
    if (uploadType === 'phrase' && (!translation.trim() || segments.length === 0)) return

    setStatus('uploading'); setError(null)
    try {
      const form = new FormData()
      form.append('video', file, file.name)
      form.append('category_id', String(categoryId))

      let url: string
      if (uploadType === 'gesture') {
        url = '/api/contributions/upload/gesture'
        form.append('gloss', gloss.trim().toUpperCase())
      } else {
        url = '/api/contributions/upload/phrase'
        form.append('translation', translation.trim())
        form.append('segments_json', JSON.stringify(segments))
      }

      const res = await fetch(url, { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.detail ?? `HTTP ${res.status}`)
      }
      setResult(await res.json())
      setStatus('done')
      invalidateGestureCache()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nieznany błąd')
      setStatus('error')
    }
  }

  function reset() {
    setFile(null); setStatus('idle'); setResult(null); setError(null)
    setGloss(''); setTranslation(''); setSegments([]); setMarkerStart(null); setPendingGloss('')
  }

  return (
    <main className="learn-view">
      {status === 'done' ? (
        <div className="contrib-success">
          <div className="contrib-success__body">
            <div className="contrib-success__icon"><Icon name="check" size={28} /></div>
            <div>
              <strong>{uploadType === 'gesture' ? `Gest „${gloss}" został dodany` : 'Zdanie zostało dodane'}</strong>
              <p>Nagranie zapisano, trwa ekstrakcja punktów charakterystycznych…</p>
            </div>
          </div>
          <button className="primary-button" onClick={reset} type="button">Dodaj kolejne</button>
        </div>
      ) : (
        <div className="contrib-form">

          {/* Type toggle */}
          <div className="mode-tabs">
            <button className={`mode-tab${uploadType === 'gesture' ? ' mode-tab--active' : ''}`}
              onClick={() => setUploadType('gesture')} type="button">
              Pojedynczy gest
            </button>
            <button className={`mode-tab${uploadType === 'phrase' ? ' mode-tab--active' : ''}`}
              onClick={() => setUploadType('phrase')} type="button">
              Zdanie
            </button>
          </div>

          {/* Category */}
          <div className="form-field">
            <label className="form-label" htmlFor="cat">Kategoria</label>
            <select id="cat" className="form-input" value={categoryId}
              onChange={e => setCategoryId(Number(e.target.value))}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Gesture-only: gloss */}
          {uploadType === 'gesture' && (
            <div className="form-field">
              <label className="form-label" htmlFor="gloss">Glos</label>
              <input id="gloss" className="form-input" type="text" placeholder="np. CZEŚĆ"
                value={gloss} onChange={e => setGloss(e.target.value.toUpperCase())} />
            </div>
          )}

          {/* Phrase-only: translation */}
          {uploadType === 'phrase' && (
            <div className="form-field">
              <label className="form-label" htmlFor="trans">Tłumaczenie polskie</label>
              <input id="trans" className="form-input" type="text" placeholder="np. Cześć, jak się masz?"
                value={translation} onChange={e => setTranslation(e.target.value)} />
            </div>
          )}

          {/* File picker */}
          <div className="form-field">
            <label className="form-label">Wideo</label>
            {!file ? (
              <div className="upload-dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('video/')) setFile(f) }}>
                <Icon name="upload" size={26} />
                <p>Przeciągnij lub <span className="link-text">wybierz plik</span></p>
                <small>MP4, MOV, WEBM</small>
                <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
              </div>
            ) : (
              <div className="contrib-file">
                <span className="contrib-file__icon"><Icon name="materials" size={18} /></span>
                <div className="contrib-file__meta">
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                </div>
                <button
                  className="contrib-file__remove"
                  onClick={() => {
                    setFile(null)
                    setSegments([])
                    setMarkerStart(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                  type="button"
                >
                  Usuń
                </button>
              </div>
            )}
          </div>

          {/* Gesture: simple preview */}
          {uploadType === 'gesture' && videoURL && (
            <div className="marker-section">
              <video src={videoURL} className="marker-video" controls />
            </div>
          )}

          {/* Zdanie: timeline marker UI */}
          {uploadType === 'phrase' && videoURL && (
            <div className="marker-section">
              <video ref={videoRef} src={videoURL} className="marker-video" controls />

              <div className="marker-block">
                <span className="form-label">Zaznacz granice gestów</span>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Glos (np. CZEŚĆ)"
                  value={pendingGloss}
                  onChange={e => setPendingGloss(e.target.value.toUpperCase())}
                />
                <div className="marker-controls">
                  <button
                    className="contrib-btn contrib-btn--ghost"
                    disabled={markerStart !== null}
                    onClick={addMarkerStart}
                    type="button"
                  >
                    <Icon name="play" size={14} /> Start gestu
                  </button>
                  <button
                    className="contrib-btn contrib-btn--solid"
                    disabled={markerStart == null || !pendingGloss.trim()}
                    onClick={addMarkerEnd}
                    type="button"
                  >
                    <Icon name="pause" size={14} /> Koniec gestu
                  </button>
                </div>
                {markerStart != null && (
                  <p className="marker-hint">Start zaznaczony: {(markerStart / 1000).toFixed(2)}s — odtwórz do końca gestu</p>
                )}
              </div>

              {segments.length > 0 && (
                <div className="segment-list">
                  {segments.map((s, i) => (
                    <div key={i} className="segment-row">
                      <span className="phrase-gesture-chip">{s.gloss}</span>
                      <span className="sign-frames">{(s.start_ms / 1000).toFixed(2)}s – {(s.end_ms / 1000).toFixed(2)}s</span>
                      <button className="contrib-btn contrib-btn--text" onClick={() => removeSegment(i)} type="button">
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="translator-status translator-status--error">
              <Icon name="info" size={16} /> {error}
            </div>
          )}

          <div className="contrib-actions">
            <button
              className="primary-button"
              disabled={
                !file || status === 'uploading' ||
                (uploadType === 'gesture' && !gloss.trim()) ||
                (uploadType === 'phrase' && (!translation.trim() || segments.length === 0))
              }
              onClick={submit}
              type="button"
            >
              {status === 'uploading'
                ? <><span className="spinner contrib-actions__spinner" /> Przetwarzanie…</>
                : <><Icon name="upload" size={15} /> Dodaj do biblioteki</>}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

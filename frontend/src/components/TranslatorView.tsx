import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

// ── Types matching backend RecognitionResult ──────────────────────────────────

type DetectedSign = {
  gloss: string
  confidence: number
  start_frame: number
  end_frame: number
}

type TranslationResult = {
  glosses: string[]
  translation: string | null
  signs: DetectedSign[]
  fps: number
  n_frames: number
}

// ── Main component ────────────────────────────────────────────────────────────

type Mode = 'upload' | 'record'
type Status = 'idle' | 'processing' | 'done' | 'error'

export function TranslatorView() {
  const [mode, setMode] = useState<Mode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function reset() {
    setFile(null)
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
  }

  async function submit(blob: Blob, filename = 'recording.webm') {
    setStatus('processing')
    setResult(null)
    setErrorMsg(null)
    try {
      const form = new FormData()
      form.append('video', blob instanceof File ? blob : new File([blob], filename, { type: blob.type }))
      const res = await fetch('/api/sign-language/translate', { method: 'POST', body: form })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail?.detail ?? `HTTP ${res.status} ${res.statusText}`)
      }
      const data: TranslationResult = await res.json()
      setResult(data)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Nieznany błąd')
      setStatus('error')
    }
  }

  return (
    <main className="translator-view">
      {/* Mode toggle */}
      <div className="mode-tabs">
        <button
          className={`mode-tab${mode === 'upload' ? ' mode-tab--active' : ''}`}
          onClick={() => { setMode('upload'); reset() }}
          type="button"
        >
          <Icon name="upload" size={16} /> Prześlij wideo
        </button>
        <button
          className={`mode-tab${mode === 'record' ? ' mode-tab--active' : ''}`}
          onClick={() => { setMode('record'); reset() }}
          type="button"
        >
          <Icon name="play" size={16} /> Nagraj
        </button>
      </div>

      {/* Input panel */}
      <div className="translator-panel">
        {mode === 'upload' ? (
          <UploadPane
            file={file}
            dragOver={dragOver}
            onFile={setFile}
            onDragOver={setDragOver}
            onSubmit={() => file && submit(file, file.name)}
            onReset={reset}
            status={status}
          />
        ) : (
          <RecordPane onSubmit={submit} onReset={reset} status={status} />
        )}
      </div>

      {/* Results */}
      {status === 'processing' && (
        <div className="translator-status">
          <span className="spinner" />
          Analizowanie wideo…
        </div>
      )}
      {status === 'error' && (
        <div className="translator-status translator-status--error">
          <Icon name="info" size={18} /> {errorMsg}
        </div>
      )}
      {status === 'done' && result && <ResultPanel result={result} />}
    </main>
  )
}

// ── Upload pane ───────────────────────────────────────────────────────────────

type UploadPaneProps = {
  file: File | null
  dragOver: boolean
  status: Status
  onFile: (f: File) => void
  onDragOver: (v: boolean) => void
  onSubmit: () => void
  onReset: () => void
}

function UploadPane({ file, dragOver, status, onFile, onDragOver, onSubmit, onReset }: UploadPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewURL, setPreviewURL] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreviewURL(null); return }
    const url = URL.createObjectURL(file)
    setPreviewURL(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    onDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('video/')) onFile(f)
  }

  return (
    <div className="upload-area-wrap">
      {!file ? (
        <div
          className={`upload-dropzone${dragOver ? ' upload-dropzone--over' : ''}`}
          onDragOver={e => { e.preventDefault(); onDragOver(true) }}
          onDragLeave={() => onDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" size={32} />
          <p>Przeciągnij plik wideo lub <span className="link-text">wybierz z dysku</span></p>
          <small>MP4, MOV, WEBM · maks. 100 MB</small>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
        </div>
      ) : (
        <>
          <div className="upload-selected">
            <Icon name="materials" size={20} />
            <span>{file.name}</span>
            <span className="upload-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <button className="back-button" onClick={onReset} type="button">Usuń</button>
          </div>
          {previewURL && (
            <video
              src={previewURL}
              className="upload-preview"
              controls
              preload="metadata"
            />
          )}
        </>
      )}

      <div className="translator-actions">
        <button
          className="primary-button"
          disabled={!file || status === 'processing'}
          onClick={onSubmit}
          type="button"
        >
          {status === 'processing' ? 'Przetwarzanie…' : 'Tłumacz'}
        </button>
      </div>
    </div>
  )
}

// ── Record pane ───────────────────────────────────────────────────────────────

type RecordPaneProps = {
  status: Status
  onSubmit: (blob: Blob) => void
  onReset: () => void
}

function RecordPane({ status, onSubmit, onReset }: RecordPaneProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const mediaRef   = useRef<MediaRecorder | null>(null)
  const chunksRef  = useRef<BlobPart[]>([])
  const streamRef  = useRef<MediaStream | null>(null)
  const [facing, setFacing]     = useState<'user' | 'environment'>('user')
  const [recording, setRecording] = useState(false)
  const [blob, setBlob]           = useState<Blob | null>(null)
  const [camError, setCamError]   = useState<string | null>(null)

  async function startCamera(facingMode: 'user' | 'environment' = facing) {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setCamError(null)
    } catch {
      setCamError('Brak dostępu do kamery. Sprawdź uprawnienia przeglądarki.')
    }
  }

  useEffect(() => { startCamera(); return () => streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  async function flipCamera() {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    await startCamera(next)
  }

  function startRecording() {
    const stream = videoRef.current?.srcObject as MediaStream | null
    if (!stream) return
    chunksRef.current = []
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm' })
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => setBlob(new Blob(chunksRef.current, { type: 'video/webm' }))
    mr.start()
    mediaRef.current = mr
    setRecording(true)
    setBlob(null)
  }

  function stopRecording() { mediaRef.current?.stop(); setRecording(false) }

  function handleReset() { setBlob(null); onReset() }

  if (camError) {
    return <div className="translator-status translator-status--error"><Icon name="info" size={18} /> {camError}</div>
  }

  return (
    <div className="record-wrap">
      <div className="record-preview-wrap">
        <video ref={videoRef} className="record-preview" muted playsInline />
        {recording && <span className="record-indicator" />}
        {!recording && !blob && (
          <button className="cam-flip-btn" onClick={flipCamera} type="button" aria-label="Odwróć kamerę">
            <Icon name="flip-camera" size={22} />
          </button>
        )}
      </div>

      <div className="translator-actions">
        {!blob ? (
          recording
            ? <button className="stop-button" onClick={stopRecording} type="button"><Icon name="pause" size={16} /> Zatrzymaj</button>
            : <button className="primary-button" onClick={startRecording} type="button"><Icon name="play" size={16} /> Nagraj</button>
        ) : (
          <>
            <button className="back-button" onClick={handleReset} type="button">Nagraj ponownie</button>
            <button
              className="primary-button"
              disabled={status === 'processing'}
              onClick={() => onSubmit(blob)}
              type="button"
            >
              {status === 'processing' ? 'Przetwarzanie…' : 'Tłumacz nagranie'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: TranslationResult }) {
  const duration = result.n_frames / result.fps

  return (
    <section className="result-panel">
      {result.translation && (
        <div className="result-translation">
          <span className="eyebrow eyebrow--green">Tłumaczenie</span>
          <p className="result-translation__text">{result.translation}</p>
        </div>
      )}

      <div className="result-glosses">
        <span className="eyebrow">Sekwencja gestów</span>
        <div className="gloss-chips">
          {result.glosses.length > 0
            ? result.glosses.map((g, i) => <span key={i} className="phrase-gesture-chip">{g}</span>)
            : <span className="result-empty">Nie rozpoznano żadnych gestów</span>
          }
        </div>
      </div>

      {result.signs.length > 0 && (
        <div className="result-signs">
          <span className="eyebrow">Szczegóły ({result.signs.length} gestów · {duration.toFixed(1)}s · {result.fps.toFixed(0)} fps)</span>
          <div className="signs-table">
            {result.signs.map((s, i) => (
              <div key={i} className="sign-row">
                <span className="sign-gloss">{s.gloss}</span>
                <div className="sign-bar-wrap">
                  <div className="sign-bar" style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                </div>
                <span className="sign-confidence">{Math.round(s.confidence * 100)}%</span>
                <span className="sign-frames">{s.start_frame}–{s.end_frame}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

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
type Status = 'idle' | 'recording' | 'processing' | 'done' | 'error'
type Stage = 'extracting' | 'segmenting' | 'classifying' | 'translating' | null

const STAGE_LABEL: Record<Exclude<Stage, null>, string> = {
  extracting:  'Wyodrębnianie punktów…',
  segmenting:  'Segmentacja gestów…',
  classifying: 'Rozpoznawanie gestów…',
  translating: 'Tłumaczenie…',
}

function extFromBlob(blob: Blob, fallbackName?: string): string {
  const fromName = fallbackName?.match(/\.[a-z0-9]+$/i)?.[0]
  if (fromName) return fromName.toLowerCase()
  if (blob.type.includes('mp4')) return '.mp4'
  if (blob.type.includes('quicktime')) return '.mov'
  return '.webm'
}

function handleWsMessage(
  raw: string,
  handlers: {
    onStatus: (s: Stage) => void
    onGloss: (g: string) => void
    onTranslationDelta: (t: string) => void
    onDone: (msg: TranslationResult) => void
    onError: (detail: string) => void
  },
) {
  try {
    const msg = JSON.parse(raw)
    if (msg.type === 'status') handlers.onStatus(msg.stage ?? null)
    else if (msg.type === 'timing') console.info('[translate timing]', msg)
    else if (msg.type === 'gloss') handlers.onGloss(msg.gloss)
    else if (msg.type === 'translation_delta') handlers.onTranslationDelta(msg.text ?? '')
    else if (msg.type === 'done') {
      const glosses = msg.glosses ?? []
      handlers.onDone({
        glosses,
        translation: msg.translation ?? null,
        signs: msg.signs ?? [],
        fps: msg.fps ?? 25,
        n_frames: msg.n_frames ?? 0,
      })
    } else if (msg.type === 'error') handlers.onError(msg.detail ?? 'Błąd tłumaczenia')
  } catch { /* ignore */ }
}

export function TranslatorView() {
  const [mode, setMode] = useState<Mode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [stage, setStage] = useState<Stage>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [liveGlosses, setLiveGlosses] = useState<string[]>([])
  const [liveTranslation, setLiveTranslation] = useState('')

  function reset() {
    setFile(null)
    setStatus('idle')
    setStage(null)
    setErrorMsg(null)
    setLiveGlosses([])
    setLiveTranslation('')
  }

  const wsHandlers = {
    onStatus: (s: Stage) => setStage(s),
    onGloss: (g: string) => { setLiveGlosses(prev => [...prev, g]); setStage('classifying') },
    onTranslationDelta: (t: string) => {
      setLiveTranslation(prev => prev + t)
      setStage('translating')
    },
    onDone: (_r: TranslationResult) => { setStatus('done'); setStage(null) },
    onError: (detail: string) => { setErrorMsg(detail); setStatus('error'); setStage(null) },
  }

  // ── WebSocket submit (upload + record fallback) ───────────────────────────
  const WS_UPLOAD_CHUNK = 256 * 1024

  function submitViaWs(blob: Blob, filename?: string) {
    setStatus('processing')
    setStage('extracting')
    setErrorMsg(null)
    setLiveGlosses([])
    setLiveTranslation('')

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/translate`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      void (async () => {
        try {
          const buf = await blob.arrayBuffer()
          const bytes = new Uint8Array(buf)
          for (let i = 0; i < bytes.length; i += WS_UPLOAD_CHUNK) {
            if (ws.readyState !== WebSocket.OPEN) throw new Error('Połączenie przerwane podczas wysyłania')
            while (ws.bufferedAmount > WS_UPLOAD_CHUNK * 4) {
              await new Promise(r => setTimeout(r, 20))
              if (ws.readyState !== WebSocket.OPEN) throw new Error('Połączenie przerwane podczas wysyłania')
            }
            ws.send(bytes.slice(i, i + WS_UPLOAD_CHUNK).buffer)
          }
          ws.send(JSON.stringify({ done: true, ext: extFromBlob(blob, filename) }))
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Błąd wysyłania pliku')
          setStatus('error')
          setStage(null)
          ws.close()
        }
      })()
    }

    ws.onmessage = (ev) => {
      handleWsMessage(ev.data as string, {
        ...wsHandlers,
        onDone: (r) => { wsHandlers.onDone(r); ws.close() },
        onError: (d) => { wsHandlers.onError(d); ws.close() },
      })
    }

    ws.onerror = () => {
      setErrorMsg('Błąd połączenia z serwerem')
      setStatus('error')
      setStage(null)
    }
  }

  const showStream =
    status === 'processing' ||
    status === 'done' ||
    (status === 'recording' && liveGlosses.length > 0)

  return (
    <main className="translator-view">
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

      <div className="translator-panel">
        {mode === 'upload' ? (
          <UploadPane
            file={file}
            dragOver={dragOver}
            onFile={setFile}
            onDragOver={setDragOver}
            onSubmit={() => file && submitViaWs(file, file.name)}
            onReset={reset}
            status={status}
          />
        ) : (
          <RecordPane
            status={status}
            onFallbackSubmit={blob => submitViaWs(blob, 'recording.webm')}
            onReset={reset}
            onStatusChange={setStatus}
            onLiveGloss={g => setLiveGlosses(prev => [...prev, g])}
            onTranslationDelta={t => setLiveTranslation(prev => prev + t)}
            onResult={() => { setStatus('done'); setStage(null) }}
            onError={msg => { setErrorMsg(msg); setStatus('error'); setStage(null) }}
          />
        )}
      </div>

      {showStream && (status === 'processing' || liveGlosses.length > 0 || liveTranslation) && (
        <section className="stream-panel">
          <div className="live-glosses-panel">
            <span className="eyebrow">
              {stage && stage !== 'translating' ? STAGE_LABEL[stage] : 'Sekwencja gestów'}
            </span>
            <div className="gloss-chips">
              {liveGlosses.length > 0
                ? liveGlosses.map((g, i) => (
                    <span key={i} className="phrase-gesture-chip live-gloss-chip">{g}</span>
                  ))
                : status === 'processing' && (
                    <span className="result-empty">Czekam na pierwsze gesty…</span>
                  )}
              {status === 'processing' && stage !== 'translating' && stage !== null && (
                <span className="spinner" style={{ marginLeft: 8 }} />
              )}
            </div>
          </div>

          {(stage === 'translating' || liveTranslation || status === 'done') && (
            <div className="live-translation-panel">
              <span className="eyebrow eyebrow--green">
                {stage === 'translating' ? 'Tłumaczenie…' : 'Tłumaczenie'}
              </span>
              <p className="live-translation-text">
                {liveTranslation || (stage === 'translating' ? <span className="spinner" /> : '—')}
                {stage === 'translating' && liveTranslation && <span className="stream-caret" />}
              </p>
            </div>
          )}
        </section>
      )}

      {status === 'error' && (
        <div className="translator-status translator-status--error">
          <Icon name="info" size={18} /> {errorMsg}
        </div>
      )}
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
  onFallbackSubmit: (blob: Blob) => void
  onReset: () => void
  onStatusChange: (s: Status) => void
  onLiveGloss: (g: string) => void
  onTranslationDelta: (t: string) => void
  onResult: () => void
  onError: (msg: string) => void
}

const WS_CHUNK_MS = 1_500  // send a chunk to the server every 1.5 seconds

function RecordPane({
  status, onFallbackSubmit, onReset,
  onStatusChange, onLiveGloss, onTranslationDelta, onResult, onError,
}: RecordPaneProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const mediaRef   = useRef<MediaRecorder | null>(null)
  const wsRef      = useRef<WebSocket | null>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const [facing, setFacing]       = useState<'user' | 'environment'>('user')
  const [recording, setRecording] = useState(false)
  const [blob, setBlob]           = useState<Blob | null>(null)
  const [camError, setCamError]   = useState<string | null>(null)
  const [wsReady, setWsReady]     = useState(false)

  async function startCamera(facingMode: 'user' | 'environment' = facing) {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setCamError(null)
    } catch {
      setCamError('Brak dostępu do kamery. Sprawdź uprawnienia przeglądarki.')
    }
  }

  useEffect(() => {
    startCamera()
    // Pre-connect the WebSocket so it's ready when the user hits record.
    openWs()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
    }
  }, [])

  function openWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/translate`)
    ws.binaryType = 'arraybuffer'
    ws.onopen  = () => setWsReady(true)
    ws.onclose = () => setWsReady(false)
    ws.onerror = () => setWsReady(false)
    ws.onmessage = (ev) => {
      handleWsMessage(ev.data as string, {
        onStatus: () => {},
        onGloss: onLiveGloss,
        onTranslationDelta,
        onDone: () => onResult(),
        onError,
      })
    }
    wsRef.current = ws
    return ws
  }

  async function flipCamera() {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    await startCamera(next)
  }

  function startRecording() {
    const stream = videoRef.current?.srcObject as MediaStream | null
    if (!stream) return

    // If WS isn't available, fall back to full-blob upload after stopping.
    const useWs = wsReady && wsRef.current?.readyState === WebSocket.OPEN

    const chunksRef: BlobPart[] = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'
    const mr = new MediaRecorder(stream, { mimeType })

    mr.ondataavailable = (e) => {
      if (e.data.size === 0) return
      chunksRef.push(e.data)
      if (useWs && wsRef.current?.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => wsRef.current?.send(buf))
      }
    }

    mr.onstop = () => {
      const b = new Blob(chunksRef, { type: 'video/webm' })
      setBlob(b)
      if (useWs && wsRef.current?.readyState === WebSocket.OPEN) {
        // Signal end of recording — server will run Gemini and send final result
        wsRef.current.send(JSON.stringify({ done: true, ext: '.webm' }))
        onStatusChange('processing')
      }
    }

    mr.start(WS_CHUNK_MS)  // timeslice — ondataavailable fires every N ms
    mediaRef.current = mr
    setRecording(true)
    setBlob(null)
    onStatusChange('recording')
  }

  function stopRecording() { mediaRef.current?.stop(); setRecording(false) }

  function handleReset() {
    setBlob(null)
    // Reconnect WS for a fresh session
    wsRef.current?.close()
    openWs()
    onReset()
  }

  if (camError) {
    return <div className="translator-status translator-status--error"><Icon name="info" size={18} /> {camError}</div>
  }

  const isProcessing = status === 'processing'

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
            {/* Fallback: manual submit if WS session missed the final result */}
            {!isProcessing && status !== 'done' && (
              <button
                className="primary-button"
                onClick={() => onFallbackSubmit(blob)}
                type="button"
              >
                Tłumacz nagranie
              </button>
            )}
            {isProcessing && (
              <button className="primary-button" disabled type="button">
                <span className="spinner" /> Tłumaczenie…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}


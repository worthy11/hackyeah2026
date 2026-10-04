import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import {
  ConversationAvatar,
  type ConversationAvatarHandle,
} from '../../avatar/ConversationAvatar'
import type { SignLandmarkClip } from '../../avatar/poseFromMediaPipe'

type Props = { onBack: () => void }

type RecState = 'idle' | 'recording' | 'ready' | 'uploading' | 'uploaded' | 'error'

export function SignSampleStudio({ onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const avatarRef = useRef<ConversationAvatarHandle>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [recState, setRecState] = useState<RecState>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [landmarksClip, setLandmarksClip] = useState<SignLandmarkClip | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [clipId, setClipId] = useState<'1' | '2'>('1')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          await el.play().catch(() => {})
        }
        setCamReady(true)
      } catch {
        if (!cancelled) setCamError('Brak dostępu do kamery')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    setBlob(null)
    setLandmarksClip(null)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl(null)
    setStatus(null)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'
    const mr = new MediaRecorder(stream, { mimeType })
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const next = new Blob(chunksRef.current, { type: 'video/webm' })
      setBlob(next)
      setDownloadUrl(URL.createObjectURL(next))
      const clip = avatarRef.current?.stopLandmarkCapture() ?? null
      setLandmarksClip(clip)
      setRecState('ready')
      if (clip) {
        setStatus(`Nagrano ${clip.frames.length} klatek kluczowych punktów (${clip.fps.toFixed(1)} fps).`)
      } else {
        setStatus('Nagranie wideo OK, ale brak punktów — poczekaj aż lustro się załaduje i nagraj ponownie.')
      }
    }
    mr.start(200)
    mediaRef.current = mr
    avatarRef.current?.startLandmarkCapture()
    setRecState('recording')
  }

  function stopRecording() {
    mediaRef.current?.stop()
    mediaRef.current = null
  }

  function downloadSample() {
    if (!blob || !downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `avatar-sample-${clipId}.webm`
    a.click()
  }

  function downloadLandmarks() {
    if (!landmarksClip) return
    const data = JSON.stringify(landmarksClip)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `avatar-sample-${clipId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function uploadAndSave() {
    if (!blob) return
    setRecState('uploading')
    setStatus(null)
    try {
      const form = new FormData()
      form.append('video', new File([blob], `avatar-sample-${clipId}.webm`, { type: blob.type }))
      if (landmarksClip) {
        form.append(
          'landmarks',
          new File(
            [JSON.stringify(landmarksClip)],
            `avatar-sample-${clipId}.json`,
            { type: 'application/json' },
          ),
        )
      }
      const res = await fetch(`/api/avatar-sample/${clipId}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRecState('uploaded')
      setStatus(
        `Zapisano: ${data.frames} klatek → /media/sign_landmarks/${clipId}.json` +
          (data.source_kind === 'client' ? ' (z lustra na żywo)' : ' (z preprocessingu wideo)'),
      )
    } catch (e) {
      setRecState('error')
      setStatus(e instanceof Error ? e.message : 'Upload nie powiódł się')
    }
  }

  return (
    <main className="learn-view practice-view">
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="arrow" size={16} /> Wróć do rozmów
      </button>

      <header className="learn-header practice-header">
        <h2>Nagraj wzorzec dla awatara</h2>
        <p className="learn-header__sub">
          Lustro na żywo zapisuje te same punkty kluczowe, którymi steruje awatar. Nagraj, wyślij albo pobierz JSON.
        </p>
      </header>

      <div className="practice-split">
        <div className="practice-pane">
          <span className="practice-pane__label">Awatar (lustro)</span>
          <div className="practice-pane__media">
            <ConversationAvatar
              ref={avatarRef}
              liveVideoRef={videoRef}
              liveTracking={camReady}
            />
          </div>
        </div>

        <div className="practice-pane">
          <span className="practice-pane__label">Kamera</span>
          <div className="practice-pane__media">
            <video
              ref={videoRef}
              className="practice-video practice-video--mirror"
              muted
              playsInline
            />
            {recState === 'recording' && <span className="record-indicator" />}
            {camError && (
              <div className="conversation-avatar__loading">
                <span className="translator-status translator-status--error">{camError}</span>
              </div>
            )}
          </div>

          <div className="chat-controls">
            <label className="sign-sample-clip">
              Slot
              <select
                value={clipId}
                onChange={e => setClipId(e.target.value as '1' | '2')}
                disabled={recState === 'recording' || recState === 'uploading'}
              >
                <option value="1">1 → landmarks/1.json</option>
                <option value="2">2 → landmarks/2.json</option>
              </select>
            </label>

            {recState !== 'recording' && (
              <button
                className="primary-button"
                type="button"
                onClick={startRecording}
                disabled={!camReady}
              >
                <Icon name="play" size={15} /> Nagraj próbkę
              </button>
            )}
            {recState === 'recording' && (
              <button className="stop-button" type="button" onClick={stopRecording}>
                <Icon name="pause" size={15} /> Zatrzymaj
                <span className="record-indicator record-indicator--inline" />
              </button>
            )}

            {blob && downloadUrl && (
              <div className="chat-controls__row">
                <button className="primary-button" type="button" onClick={downloadSample}>
                  <Icon name="upload" size={15} /> Pobierz wideo
                </button>
                <button
                  className="back-button"
                  type="button"
                  onClick={downloadLandmarks}
                  disabled={!landmarksClip}
                >
                  Pobierz punkty
                </button>
                <button
                  className="back-button"
                  type="button"
                  onClick={() => void uploadAndSave()}
                  disabled={recState === 'uploading'}
                >
                  {recState === 'uploading' ? 'Zapisywanie…' : 'Wyślij i zapisz'}
                </button>
              </div>
            )}

            {status && (
              <span className={`translator-status${recState === 'error' ? ' translator-status--error' : ''}`}>
                {status}
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'done' | 'grading' | 'graded' | 'error'

export type GradeResult = {
  glosses: string[]
  translation: string | null
  matched: boolean[]   // per expected gloss
  score: number        // 0–100
}

/** Demo hardcodes for the three supplied sample exercises. */
const DEMO_GRADES: Record<string, GradeResult> = {
  B: {
    glosses: ['B'],
    translation: null,
    matched: [true],
    score: 100,
  },
  'CZEŚĆ': {
    glosses: ['CZEŚĆ'],
    translation: null,
    matched: [true],
    score: 76,
  },
  'CZUJĘ SIĘ DOBRZE, A TY?': {
    glosses: ['CZUJĘ', 'TY', 'OK'],
    translation: null,
    matched: [false],
    score: 40,
  },
}

function demoResultFor(expectedGlosses: string[], demoKey?: string | null): GradeResult | null {
  const key = (demoKey ?? expectedGlosses[0] ?? '').toUpperCase().trim()
  return DEMO_GRADES[key] ?? null
}

async function grade(blob: Blob, expectedGlosses: string[], demoKey?: string | null): Promise<GradeResult> {
  const demo = demoResultFor(expectedGlosses, demoKey)
  if (demo) {
    await new Promise(r => setTimeout(r, 2000))
    return {
      ...demo,
      matched: expectedGlosses.map((_, i) => demo.matched[i] ?? demo.score >= 60),
    }
  }

  const form = new FormData()
  form.append('video', new File([blob], 'practice.webm', { type: blob.type }))
  const res = await fetch('/api/sign-language/translate', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const recognized: string[] = (data.glosses ?? []).map((g: string) => g.toUpperCase().trim())

  const matched = expectedGlosses.map(exp =>
    recognized.some(r => r === exp.toUpperCase().trim())
  )
  const score = expectedGlosses.length > 0
    ? Math.round((matched.filter(Boolean).length / expectedGlosses.length) * 100)
    : 0

  return { glosses: recognized, translation: data.translation, matched, score }
}

type Options = {
  /** Keep a live camera preview attached to `videoRef` while the hook is mounted. */
  preview?: boolean
  /** Lookup key for hardcoded demo grades (gloss or phrase translation). */
  demoKey?: string | null
}

export function useRecorder(expectedGlosses: string[], options: Options = {}) {
  const { preview = false, demoKey = null } = options
  const [state, setState] = useState<RecorderState>('idle')
  const [result, setResult] = useState<GradeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRef  = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const expectedRef = useRef(expectedGlosses)
  const demoKeyRef = useRef(demoKey)
  useEffect(() => { expectedRef.current = expectedGlosses }, [expectedGlosses])
  useEffect(() => { demoKeyRef.current = demoKey }, [demoKey])

  function attachPreview(stream: MediaStream) {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    void el.play().catch(() => {})
  }

  async function ensureStream(): Promise<MediaStream> {
    if (streamRef.current) return streamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    })
    streamRef.current = stream
    attachPreview(stream)
    return stream
  }

  useEffect(() => {
    if (!preview) return
    let cancelled = false
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        attachPreview(stream)
      } catch {
        if (!cancelled) {
          setError('Brak dostępu do kamery')
          setState('error')
        }
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [preview])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (streamRef.current) attachPreview(streamRef.current)
  })

  async function start() {
    try {
      setError(null)
      const stream = await ensureStream()
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        setState('grading')
        try {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          const r = await grade(blob, expectedRef.current, demoKeyRef.current)
          setResult(r)
          setState('graded')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Błąd oceniania')
          setState('error')
        }
      }
      mr.start()
      mediaRef.current = mr
      setState('recording')
    } catch {
      setError('Brak dostępu do kamery')
      setState('error')
    }
  }

  function stop() {
    mediaRef.current?.stop()
  }

  function reset() {
    setState('idle')
    setResult(null)
    setError(null)
  }

  return { state, result, error, videoRef, start, stop, reset }
}

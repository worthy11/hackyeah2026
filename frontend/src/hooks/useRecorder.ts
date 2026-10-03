import { useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'done' | 'grading' | 'graded' | 'error'

export type GradeResult = {
  glosses: string[]
  translation: string | null
  matched: boolean[]   // per expected gloss
  score: number        // 0–100
}

async function grade(blob: Blob, expectedGlosses: string[]): Promise<GradeResult> {
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

export function useRecorder(expectedGlosses: string[]) {
  const [state, setState] = useState<RecorderState>('idle')
  const [result, setResult] = useState<GradeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRef  = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        setState('grading')
        try {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          const r = await grade(blob, expectedGlosses)
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
    streamRef.current?.getTracks().forEach(t => t.stop())
    setState('idle')
    setResult(null)
    setError(null)
  }

  return { state, result, error, start, stop, reset }
}

import { useEffect, useState } from 'react'
import AvatarStage from './avatar/AvatarStage'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('Checking API…')

  useEffect(() => {
    const controller = new AbortController()

    async function checkApi() {
      try {
        const res = await fetch(`${API_BASE}/api/`, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { message?: string }
        setMessage(data.message ?? 'API reachable')
        setStatus('ok')
      } catch (err) {
        if (controller.signal.aborted) return
        setMessage(err instanceof Error ? err.message : 'API unreachable')
        setStatus('error')
      }
    }

    void checkApi()
    return () => controller.abort()
  }, [])

  return (
    <main className="app">
      <header className="top">
        <h1>HackYeah</h1>
        <p className={`status status--${status}`}>{message}</p>
      </header>
      <AvatarStage />
    </main>
  )
}

export default App

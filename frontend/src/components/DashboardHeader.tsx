import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { MOCK_USERS, useUser } from '../context/UserContext'

const VIEW_LABELS: Record<string, string> = {
  'Tłumacz':        'Tłumacz',
  'Nauka':          'Nauka',
  'Rozmowy':        'Rozmowy',
  'Moje materiały': 'Moje materiały',
  'Dodaj nagranie': 'Dodaj nagranie',
  'Zasoby':         'Zasoby',
}

export function DashboardHeader({ onHome: _onHome, activeItem = 'home' }: { onHome?: () => void; activeItem?: string }) {
  const { user, setUser } = useUser()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const isHome = activeItem === 'home'

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className={`topbar${isHome ? ' topbar--home' : ''}`}>
      <div className="greeting">
        {!isHome && <h1>{VIEW_LABELS[activeItem] ?? activeItem}</h1>}
      </div>
      <div className="account-actions">
        <button aria-label="Powiadomienia" className="icon-button notification-button" type="button">
          <Icon name="bell" />
        </button>
        <div className="account-switcher" ref={wrapRef}>
          <button
            aria-label={`Profil: ${user.name}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="profile-button"
            onClick={() => setOpen(o => !o)}
            type="button"
          >
            <span className="profile-avatar">{user.initials}</span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.subtitle}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>

          {open && (
            <div className="switcher-menu switcher-menu--top" role="listbox">
              <p className="switcher-label">Przełącz konto (demo)</p>
              {MOCK_USERS.map(u => (
                <button
                  key={u.id}
                  className={`switcher-item${u.id === user.id ? ' switcher-item--active' : ''}`}
                  onClick={() => { setUser(u); setOpen(false) }}
                  role="option"
                  aria-selected={u.id === user.id}
                  type="button"
                >
                  <span className="profile-avatar profile-avatar--sm">{u.initials}</span>
                  <span className="switcher-item__copy">
                    <span>{u.name}</span>
                    <small>{u.subtitle}</small>
                  </span>
                  {u.id === user.id && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

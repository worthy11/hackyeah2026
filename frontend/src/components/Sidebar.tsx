import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { useUser, MOCK_USERS } from '../context/UserContext'

type NavigationItem = { label: string; icon: IconName }
type NavigationProps = { activeItem: string; onNavigate: (label: string) => void }

const learningItems = [
  { label: 'Tłumacz',        icon: 'translate'     },
  { label: 'Moja nauka',     icon: 'dashboard'     },
  { label: 'Słownictwo',     icon: 'vocabulary'    },
  { label: 'Rozmowy',        icon: 'conversation'  },
  { label: 'Moje materiały', icon: 'materials'     },
] satisfies NavigationItem[]

const communityItems = [
  { label: 'Dodaj nagranie', icon: 'upload' },
  { label: 'O projekcie',    icon: 'info'   },
] satisfies NavigationItem[]

function NavigationLinks({ activeItem, onNavigate, items }: NavigationProps & { items: NavigationItem[] }) {
  return items.map(({ label, icon }) => (
    <button
      aria-current={activeItem === label ? 'page' : undefined}
      className={`nav-item${activeItem === label ? ' nav-item--active' : ''}`}
      key={label}
      onClick={() => onNavigate(label)}
      type="button"
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  ))
}

export function Sidebar({ activeItem, onNavigate }: NavigationProps) {
  const { user, setUser } = useUser()
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const visibleCommunity = communityItems.filter(item =>
    item.label !== 'Dodaj nagranie' || user.role === 'contributor'
  )

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('home')} type="button">
        <span className="brand-mark"><Icon name="materials" size={23} /></span>
        <span className="brand-copy"><strong>wMig</strong><small>Ucz się w mig</small></span>
      </button>

      <nav aria-label="Nawigacja główna" className="side-navigation">
        <p className="nav-heading">Nauka</p>
        <NavigationLinks
          activeItem={activeItem}
          items={learningItems.filter(i => i.label !== 'Moje materiały' || user.role === 'contributor')}
          onNavigate={onNavigate}
        />
        <div className="nav-divider" />
        <p className="nav-heading">Społeczność</p>
        <NavigationLinks activeItem={activeItem} items={visibleCommunity} onNavigate={onNavigate} />
      </nav>

      {/* User switcher */}
      <div className="user-switcher">
        <button className="profile-button" onClick={() => setSwitcherOpen(o => !o)} type="button">
          <span className="profile-avatar">{user.initials}</span>
          <span className="profile-copy">
            <strong>{user.name}</strong>
            <small>{user.subtitle}</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>

        {switcherOpen && (
          <div className="switcher-menu">
            <p className="switcher-label">Przełącz konto (demo)</p>
            {MOCK_USERS.map(u => (
              <button
                key={u.id}
                className={`switcher-item${u.id === user.id ? ' switcher-item--active' : ''}`}
                onClick={() => { setUser(u); setSwitcherOpen(false) }}
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
    </aside>
  )
}

export function MobileNavigation({ activeItem, onNavigate }: NavigationProps) {
  const { user } = useUser()
  const items = [
    ...learningItems.slice(0, 3),
    ...(user.role === 'contributor' ? [{ label: 'Dodaj nagranie', icon: 'upload' as IconName }] : [{ label: 'O projekcie', icon: 'info' as IconName }]),
  ]
  return (
    <nav aria-label="Nawigacja mobilna" className="mobile-navigation">
      {items.map(({ label, icon }) => (
        <button
          aria-current={activeItem === label ? 'page' : undefined}
          className={activeItem === label ? 'mobile-nav-item mobile-nav-item--active' : 'mobile-nav-item'}
          key={label}
          onClick={() => onNavigate(label)}
          type="button"
        >
          <Icon name={icon} size={19} />
          <span>{label === 'Moja nauka' ? 'Nauka' : label}</span>
        </button>
      ))}
    </nav>
  )
}

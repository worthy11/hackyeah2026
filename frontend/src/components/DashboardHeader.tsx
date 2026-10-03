import { Icon } from './Icon'

const VIEW_LABELS: Record<string, string> = {
  'Tłumacz':        'Tłumacz',
  'Moja nauka':     'Moja nauka',
  'Słownictwo':     'Słownictwo',
  'Rozmowy':        'Rozmowy',
  'Moje materiały': 'Moje materiały',
  'Dodaj nagranie': 'Dodaj nagranie',
  'O projekcie':    'O projekcie',
}

export function DashboardHeader({ onHome: _onHome, activeItem = 'home' }: { onHome?: () => void; activeItem?: string }) {
  const isHome = activeItem === 'home'
  return (
    <header className="topbar">
      <div className="greeting">
        {isHome
          ? <><h1>Dzień dobry, Anno</h1><p>Co dziś zamigasz?</p></>
          : <h1>{VIEW_LABELS[activeItem] ?? activeItem}</h1>
        }
      </div>
      <div className="account-actions">
        <button aria-label="Powiadomienia" className="icon-button notification-button" type="button">
          <Icon name="bell" />
        </button>
        <button aria-label="Profil Anny" className="profile-button" type="button">
          <span className="profile-avatar">A</span>
          <span className="profile-copy"><strong>Anna</strong><small>Uczennica</small></span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </header>
  )
}
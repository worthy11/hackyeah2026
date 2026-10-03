import { Icon, type IconName } from './Icon'

type NavigationItem = { label: string; icon: IconName }
type NavigationProps = { activeItem: string; onNavigate: (label: string) => void }

const learningItems = [
  { label: 'Moja nauka', icon: 'dashboard' },
  { label: 'Słownictwo', icon: 'vocabulary' },
  { label: 'Rozmowy', icon: 'conversation' },
  { label: 'Tłumaczenie', icon: 'translate' },
  { label: 'Moje materiały', icon: 'materials' },
] satisfies NavigationItem[]

const communityItems = [
  { label: 'Dodaj nagranie', icon: 'upload' },
  { label: 'O projekcie', icon: 'info' },
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
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('Moja nauka')} type="button">
        <span className="brand-mark"><Icon name="materials" size={23} /></span>
        <span className="brand-copy"><strong>wMig</strong><small>Ucz się w mig</small></span>
      </button>

      <nav aria-label="Nawigacja główna" className="side-navigation">
        <p className="nav-heading">Nauka</p>
        <NavigationLinks activeItem={activeItem} items={learningItems} onNavigate={onNavigate} />
        <div className="nav-divider" />
        <p className="nav-heading">Społeczność</p>
        <NavigationLinks activeItem={activeItem} items={communityItems} onNavigate={onNavigate} />
      </nav>

      <div className="weekly-progress">
        <p className="progress-label">Twój postęp</p>
        <div className="progress-copy"><strong>4 z 8</strong><span>lekcji w tym tygodniu</span></div>
        <div aria-label="Ukończono 4 z 8 lekcji" className="progress-track"><span /></div>
      </div>
    </aside>
  )
}

export function MobileNavigation({ activeItem, onNavigate }: NavigationProps) {
  return (
    <nav aria-label="Nawigacja mobilna" className="mobile-navigation">
      {learningItems.slice(0, 4).map(({ label, icon }) => (
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
import { Icon } from './Icon'

export function DashboardHeader() {
  return (
    <header className="topbar">
      <div className="greeting">
        <h1>Dzień dobry, Anno</h1>
        <p>Co dziś zamigasz?</p>
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
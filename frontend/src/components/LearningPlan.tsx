import { Icon } from './Icon'

export function LearningPlan({ onNavigate }: { onNavigate: (label: string) => void }) {
  return (
    <aside aria-label="Plan nauki" className="plan-column">
      <div className="plan-heading"><h2>Twój plan</h2><p>Sobota, 3 października</p></div>
      <section className="goal-panel">
        <h3>Dzisiejszy cel</h3>
        <div className="goal-count"><strong>1 / 2</strong><span>lekcje ukończone</span></div>
        <div aria-label="Połowa dzisiejszego celu ukończona" className="goal-track"><span /></div>
        <p>Jeszcze 5 minut nauki</p>
      </section>

      <section className="next-steps">
        <h3>Następne kroki</h3>
        <button className="step-row" onClick={() => onNavigate('Słownictwo')} type="button">
          <span className="step-icon step-icon--yellow"><Icon name="vocabulary" size={18} /></span>
          <span className="step-copy"><strong>Powtórka słówek</strong><small>5 zwrotów <span>·</span> około 3 min</small></span>
          <Icon name="arrow" size={17} />
        </button>
        <button className="step-row" onClick={() => onNavigate('Rozmowy')} type="button">
          <span className="step-icon step-icon--rose"><Icon name="conversation" size={18} /></span>
          <span className="step-copy"><strong>Krótka rozmowa</strong><small>Poznajemy się <span>·</span> około 4 min</small></span>
          <Icon name="arrow" size={17} />
        </button>
      </section>

      <section className="community-section">
        <div className="community-heading"><h3>Od społeczności</h3><p>Znaki dodane przez osoby Głuche</p></div>
        <button className="contribution-panel" onClick={() => onNavigate('Dodaj nagranie')} type="button">
          <span className="upload-icon"><Icon name="upload" size={19} /></span>
          <span className="contribution-copy"><strong>Znasz PJM?</strong><small>Dodaj nagranie</small></span>
          <Icon name="arrow" size={17} />
        </button>
      </section>
    </aside>
  )
}
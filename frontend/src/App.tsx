import { useState } from 'react'
import { DashboardHeader } from './components/DashboardHeader'
import { HomeView } from './components/HomeView'
import { LearnView } from './components/learn/LearnView'
import { VocabularyView } from './components/learn/VocabularyView'
import { TranslatorView } from './components/TranslatorView'
import { MobileNavigation, Sidebar } from './components/Sidebar'
import './App.css'

function App() {
  const [activeItem, setActiveItem] = useState('home')

  return (
    <div className="app-shell">
      <Sidebar activeItem={activeItem} onNavigate={setActiveItem} />
      <div className="workspace">
        <DashboardHeader onHome={() => setActiveItem('home')} />

        {activeItem === 'home' ? (
          <HomeView onNavigate={setActiveItem} />
        ) : activeItem === 'Moja nauka' ? (
          <LearnView />
        ) : activeItem === 'Tłumacz' ? (
          <TranslatorView />
        ) : activeItem === 'Słownictwo' ? (
          <VocabularyView />
        ) : (
          <main className="placeholder-view">
            <span className="eyebrow eyebrow--green">wMig</span>
            <h2>{activeItem}</h2>
            <p>Widok w przygotowaniu.</p>
          </main>
        )}

        <MobileNavigation activeItem={activeItem} onNavigate={setActiveItem} />
      </div>
    </div>
  )
}

export default App

import { useState } from 'react'
import { DashboardHeader } from './components/DashboardHeader'
import { LessonDashboard } from './components/LessonDashboard'
import { LearnView } from './components/learn/LearnView'
import { VocabularyView } from './components/learn/VocabularyView'
import { MobileNavigation, Sidebar } from './components/Sidebar'
import './App.css'

function App() {
  const [activeItem, setActiveItem] = useState('Moja nauka')

  return (
    <div className="app-shell">
      <Sidebar activeItem={activeItem} onNavigate={setActiveItem} />
      <div className="workspace" id="nauka">
        <DashboardHeader />
        {activeItem === 'Moja nauka' ? (
          <LearnView />
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
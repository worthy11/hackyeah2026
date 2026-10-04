import { useState } from 'react'
import { UserProvider } from './context/UserContext'
import { DashboardHeader } from './components/DashboardHeader'
import { HomeView } from './components/HomeView'
import { ContributionView } from './components/ContributionView'
import { MyMaterialsView } from './components/MyMaterialsView'
import { ConversationsView } from './components/conversations/ConversationsView'
import { TranslatorView } from './components/TranslatorView'
import { LearnView } from './components/learn/LearnView'
import { GesturePractice } from './components/learn/GesturePractice'
import { ResourcesView } from './components/ResourcesView'
import { MobileNavigation, Sidebar } from './components/Sidebar'
import type { Gesture } from './data/mockLearning'
import './App.css'

function AppShell() {
  const [activeItem, setActiveItem] = useState('home')
  const [practicingGesture, setPracticingGesture] = useState<Gesture | null>(null)

  function navigate(item: string) { setActiveItem(item); setPracticingGesture(null) }

  function openPractice(gesture: Gesture) { setPracticingGesture(gesture) }

  // Top-level practice screen (opened e.g. from the home "last studied" tiles)
  if (practicingGesture) {
    return (
      <div className="app-shell">
        <Sidebar activeItem={activeItem} onNavigate={navigate} />
        <div className="workspace">
          <DashboardHeader onHome={() => navigate('home')} activeItem={activeItem} />
          <div className="workspace-scroll">
            <GesturePractice gesture={practicingGesture} onBack={() => setPracticingGesture(null)} />
          </div>
          <MobileNavigation activeItem={activeItem} onNavigate={navigate} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar activeItem={activeItem} onNavigate={navigate} />
      <div className="workspace">
        <DashboardHeader onHome={() => navigate('home')} activeItem={activeItem} />

        <div className="workspace-scroll">
          {activeItem === 'home'            ? <HomeView onNavigate={navigate} onPractice={openPractice} />
          : activeItem === 'Tłumacz'        ? <TranslatorView />
          : activeItem === 'Nauka'          ? <LearnView />
          : activeItem === 'Rozmowy'         ? <ConversationsView />
          : activeItem === 'Moje materiały' ? <MyMaterialsView />
          : activeItem === 'Dodaj nagranie' ? <ContributionView />
          : activeItem === 'Zasoby'         ? <ResourcesView />
          : (
            <main className="placeholder-view">
              <span className="eyebrow eyebrow--green">wMig</span>
              <h2>{activeItem}</h2>
              <p>Widok w przygotowaniu.</p>
            </main>
          )}
        </div>

        <MobileNavigation activeItem={activeItem} onNavigate={navigate} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}

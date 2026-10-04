import { useState } from 'react'
import { Icon } from '../Icon'
import { ChatView } from './ChatView'

export type ConversationMeta = {
  id: string
  title: string
  subtitle: string
  lastDate: string
}

// Hardcoded example conversations shown before the user creates their own
const CHATS: ConversationMeta[] = [
  {
    id: 'shopping',
    title: 'Zakupy',
    subtitle: 'Ile to kosztuje? → Poproszę → Dziękuję',
    lastDate: 'wtorek',
  },
  {
    id: 'directions',
    title: 'Pytanie o drogę',
    subtitle: 'Gdzie jest…? → Skręć w lewo → Prosto',
    lastDate: 'środa',
  },
  {
    id: 'weather',
    title: 'Pogoda',
    subtitle: 'Jaka jest pogoda? → Zimno / Ciepło → Pada deszcz',
    lastDate: 'czwartek',
  },
  {
    id: 'family',
    title: 'Rodzina',
    subtitle: 'Mama, tata, brat, siostra → Ile masz lat?',
    lastDate: 'piątek',
  },
]

export function ConversationsView() {
  const [activeChat, setActiveChat] = useState<ConversationMeta | null>(null)

  if (activeChat) {
    return <ChatView chat={activeChat} onBack={() => setActiveChat(null)} />
  }

  return (
    <main className="learn-view">
      <div className="chat-list">
        {CHATS.map(chat => (
          <button
            key={chat.id}
            className="chat-list-item"
            onClick={() => setActiveChat(chat)}
            type="button"
          >
            <div className="chat-list-item__icon">
              <Icon name="conversation" size={22} />
            </div>
            <div className="chat-list-item__content">
              <strong>{chat.title}</strong>
            </div>
            <span className="chat-list-item__date">{chat.lastDate}</span>
            <Icon name="arrow" size={14} />
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
        <button
          className="primary-button"
          onClick={() => setActiveChat({
            id: `new-${Date.now()}`,
            title: 'Nowa konwersacja',
            subtitle: '',
            lastDate: 'dziś',
          })}
          type="button"
        >
          <Icon name="play" size={15} /> Nowa rozmowa
        </button>
      </div>
    </main>
  )
}

import { createContext, useContext, useState, type ReactNode } from 'react'

export type UserRole = 'student' | 'contributor'

export type AppUser = {
  id: number
  name: string
  initials: string
  subtitle: string
  role: UserRole
}

export const MOCK_USERS: AppUser[] = [
  { id: 1, name: 'Anna',   initials: 'A', subtitle: 'Uczennica',    role: 'student'     },
  { id: 2, name: 'Marek',  initials: 'M', subtitle: 'Kontrybutor', role: 'contributor' },
]

type UserContextValue = {
  user: AppUser
  setUser: (u: AppUser) => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser>(MOCK_USERS[0])
  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

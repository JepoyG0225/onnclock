'use client'
import { useSidebar } from './SidebarContext'

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <main
      className="pt-16 min-h-screen transition-all duration-300"
      style={{ marginLeft: collapsed ? '4rem' : '16rem' }}
    >
      <div className="p-6">{children}</div>
    </main>
  )
}

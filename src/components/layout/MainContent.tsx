'use client'
import { useSidebar } from './SidebarContext'
import { useIsMobile } from '@/hooks/useIsMobile'

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  const isMobile = useIsMobile()
  return (
    <main
      className="pt-16 min-h-screen transition-all duration-300"
      style={{ marginLeft: isMobile ? 0 : collapsed ? '4rem' : '16rem' }}
    >
      <div className="p-4 sm:p-6">{children}</div>
    </main>
  )
}

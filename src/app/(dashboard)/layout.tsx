import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

const getSession = cache(auth)
import { getCompanyName } from '@/lib/data/company'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { MainContent } from '@/components/layout/MainContent'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const companyName = session.user.companyId
    ? await getCompanyName(session.user.companyId)
    : undefined

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-gray-50">
        <AppSidebar />
        <AppHeader
          user={{ email: session.user.email, name: session.user.name }}
          companyName={companyName}
        />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  )
}

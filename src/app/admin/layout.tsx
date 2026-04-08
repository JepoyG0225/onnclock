import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  const pathname = h.get('x-pathname') ?? ''

  // Don't enforce auth on the login page itself — avoids redirect loop
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <AdminSidebar />
      <main className="flex-1 ml-[60px] min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

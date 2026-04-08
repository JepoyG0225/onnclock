import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

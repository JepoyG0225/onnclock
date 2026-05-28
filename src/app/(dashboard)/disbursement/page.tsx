import { auth } from '@/lib/auth'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { redirect } from 'next/navigation'
import DisbursementPageClient from './DisbursementPageClient'
import { Send } from 'lucide-react'

export default async function DisbursementPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  // Closed-beta gate — only allowed company IDs can access disbursement.
  // SUPER_ADMIN always passes (they can impersonate the demo company).
  const allowedIds = (process.env.DISBURSEMENT_ALLOWED_COMPANY_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const isAllowed =
    session.user.role === 'SUPER_ADMIN' || allowedIds.includes(companyId)

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="p-5 rounded-2xl bg-[#dce5f7] mb-6">
          <Send className="w-10 h-10 text-[#032b63]" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-black tracking-wide mb-4">
          Coming Soon
        </span>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Payroll Disbursement</h1>
        <p className="text-gray-500 max-w-md text-sm leading-relaxed">
          Send net pay directly to employee bank accounts via InstaPay and PesoNet —
          straight from your payroll run, no manual transfers needed.
        </p>
        <p className="mt-6 text-xs text-gray-400">
          This feature is currently in closed beta. We&apos;ll notify you when it&apos;s available for your company.
        </p>
      </div>
    )
  }

  return <DisbursementPageClient />
}

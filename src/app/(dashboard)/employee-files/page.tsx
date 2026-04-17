import { auth } from '@/lib/auth'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getHrisProAccess } from '@/lib/hris-pro'

export default async function EmployeeFilesPage() {
  const session = await auth()
  const companyId = session?.user ? await resolveEffectiveCompanyId(session.user) : null
  const access = companyId ? await getHrisProAccess(companyId) : null

  if (!access?.entitled) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-black text-amber-900">Documents requires Pro</h1>
          <p className="text-sm text-amber-800 mt-2">Upgrade to the Php 70 per employee plan to use the dedicated document compliance console.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h1 className="text-2xl font-black text-slate-900">Documents</h1>
        <p className="text-sm text-slate-600 mt-2">Employee master data and documents already exist in the system. This module will add a dedicated document console for compliance checklists, expiry tracking, and onboarding document completeness.</p>
      </div>
    </div>
  )
}



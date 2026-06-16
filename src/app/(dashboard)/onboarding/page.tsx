import { auth } from '@/lib/auth'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { getHrisProAccess } from '@/lib/hris-pro'
import { OnboardingManager } from '@/components/onboarding/OnboardingManager'

export default async function OnboardingPage() {
  const session = await auth()
  const companyId = session?.user ? await resolveEffectiveCompanyId(session.user) : null
  const access = companyId ? await getHrisProAccess(companyId) : null

  if (!access?.entitled) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-black text-amber-900">Onboarding Tracker requires Pro</h1>
          <p className="text-sm text-amber-800 mt-2">Upgrade to the Php 70 per employee plan to activate onboarding templates and progress tracking.</p>
        </div>
      </div>
    )
  }

  return <OnboardingManager />
}

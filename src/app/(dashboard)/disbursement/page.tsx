import { auth } from '@/lib/auth'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { redirect } from 'next/navigation'
import DisbursementPageClient from './DisbursementPageClient'

export default async function DisbursementPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  // Access is gated by the parent layout via HrisProGate (Pro plan).
  // The previous closed-beta env-allowlist check has been removed now
  // that disbursement is GA for all Pro customers.
  return <DisbursementPageClient />
}

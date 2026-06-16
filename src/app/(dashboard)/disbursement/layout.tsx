import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'

export default async function DisbursementLayout({ children }: { children: React.ReactNode }) {
  const enabled = await getHrisProEnabled()
  return (
    <HrisProGate enabled={enabled} featureName="Payroll Disbursement">
      {children}
    </HrisProGate>
  )
}

import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'

export default async function BudgetRequisitionsLayout({ children }: { children: React.ReactNode }) {
  const enabled = await getHrisProEnabled()
  return <HrisProGate enabled={enabled} featureName="Budget Requisitions">{children}</HrisProGate>
}

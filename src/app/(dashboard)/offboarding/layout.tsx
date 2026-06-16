import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { HrisProGate } from '@/components/layout/HrisProGate'

export default async function OffboardingLayout({ children }: { children: React.ReactNode }) {
  const isLocal = process.env.NODE_ENV === 'development'
  const enabled = isLocal || await getHrisProEnabled()
  return <HrisProGate enabled={enabled} featureName="Offboarding">{children}</HrisProGate>
}

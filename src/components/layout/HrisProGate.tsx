import Link from 'next/link'
import { Lock, Zap } from 'lucide-react'

interface HrisProGateProps {
  enabled: boolean
  children: React.ReactNode
  featureName?: string
}

export function HrisProGate({ enabled, children, featureName }: HrisProGateProps) {
  if (enabled) return <>{children}</>

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        {featureName ? `${featureName} is a PRO feature` : 'PRO Feature'}
      </h2>
      <p className="text-gray-500 max-w-sm mb-6 text-sm">
        Upgrade your plan to ₱100/employee or higher to unlock this feature and all other PRO capabilities.
      </p>
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #fa5e01, #e04e00)' }}
      >
        <Zap className="w-4 h-4" />
        Upgrade to PRO
      </Link>
    </div>
  )
}

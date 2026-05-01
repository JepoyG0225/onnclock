'use client'

type NewFeatureBadgeProps = {
  releasedAt: string
  className?: string
}

const BADGE_DURATION_DAYS = 7

export function isFeatureNew(releasedAt: string) {
  const releaseTime = new Date(releasedAt).getTime()
  if (Number.isNaN(releaseTime)) return false
  const cutoff = releaseTime + BADGE_DURATION_DAYS * 24 * 60 * 60 * 1000
  return Date.now() <= cutoff
}

export default function NewFeatureBadge({ releasedAt, className = '' }: NewFeatureBadgeProps) {
  if (!isFeatureNew(releasedAt)) return null
  return (
    <span className={`rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white ${className}`}>
      NEW
    </span>
  )
}

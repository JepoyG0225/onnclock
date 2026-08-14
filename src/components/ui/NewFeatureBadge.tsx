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
    <span className={`rounded-full border border-[var(--brand-highlight)] bg-[var(--brand-highlight)] px-2.5 py-1 text-[10px] font-black tracking-wide text-black ${className}`}>
      NEW
    </span>
  )
}

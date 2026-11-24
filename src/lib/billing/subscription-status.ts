type Status = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
type SubscriptionDates = { status: Status; trialEndsAt?: Date | string | null; currentPeriodEnd?: Date | string | null }
export function effectiveSubscriptionStatus(sub: SubscriptionDates, now = new Date()): Status {
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') return sub.status
  const end = sub.status === 'TRIAL' ? sub.trialEndsAt : sub.currentPeriodEnd
  if (end && new Date(end).getTime() <= now.getTime()) return 'EXPIRED'
  return sub.status
}

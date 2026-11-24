import { computeSSS, periodsPerMonth } from './sss'
import { computePhilHealth } from './philhealth'
import { computePagIBIG } from './pagibig'

export type MandatoryMonthToDate = {
  compensation: number
  sssEmployee: number; sssEmployer: number; sssEc: number
  philhealthEmployee: number; philhealthEmployer: number
  pagibigEmployee: number; pagibigEmployer: number
  periods: number
}
const round = (n: number) => Math.round(n * 100) / 100
const remaining = (target: number, paid = 0) => Math.max(0, round(target - paid))

/** Reconcile the current pay month's liability against earlier saved cutoffs. */
export function mandatoryContributions(args: {
  earned: number; monthlyBasic: number
  frequency: 'MONTHLY' | 'SEMI_MONTHLY' | 'WEEKLY' | 'DAILY'
  monthlyOnly: boolean; firstCutoff: boolean
  prior?: MandatoryMonthToDate
}) {
  const { prior, frequency } = args
  const earned = Math.max(0, args.earned)
  const monthlyEarned = round(earned + (prior?.compensation ?? 0))
  const deferred = args.monthlyOnly && frequency === 'SEMI_MONTHLY' && args.firstCutoff
  const provisional = frequency === 'SEMI_MONTHLY' && args.firstCutoff && !(prior?.periods)
  // The first semi-monthly cutoff is an advance; the second settles actual earnings.
  const divisor = provisional ? 2 : 1
  const basis = provisional ? earned * 2 : monthlyEarned
  const ss = basis > 0 ? computeSSS(basis) : { employeeShare: 0, employerShare: 0, ec: 0 }
  const pi = computePagIBIG(basis)
  const ph = computePhilHealth(Math.max(0, args.monthlyBasic))
  const phFraction = args.monthlyOnly || frequency === 'MONTHLY' ? 1
    : frequency === 'SEMI_MONTHLY' ? (args.firstCutoff && !(prior?.periods) ? 0.5 : 1)
    : Math.min(1, ((prior?.periods ?? 0) + 1) / periodsPerMonth(frequency))
  const zero = deferred || monthlyEarned <= 0
  return {
    sssEmployee: zero ? 0 : remaining(ss.employeeShare / divisor, prior?.sssEmployee),
    sssEmployer: zero ? 0 : remaining(ss.employerShare / divisor, prior?.sssEmployer),
    sssEc: zero ? 0 : remaining(ss.ec / divisor, prior?.sssEc),
    philhealthEmployee: zero ? 0 : remaining(ph.employeeShare * phFraction, prior?.philhealthEmployee),
    philhealthEmployer: zero ? 0 : remaining(ph.employerShare * phFraction, prior?.philhealthEmployer),
    pagibigEmployee: zero ? 0 : remaining(pi.employeeShare / divisor, prior?.pagibigEmployee),
    pagibigEmployer: zero ? 0 : remaining(pi.employerShare / divisor, prior?.pagibigEmployer),
  }
}

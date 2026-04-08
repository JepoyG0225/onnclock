import { SSS_2024 } from '../constants'

export interface SSSBracket {
  minSalary: number
  maxSalary: number
  msc: number
  employeeShare: number
  employerShare: number
  ec: number
  total: number
}

let cachedTable: SSSBracket[] | null = null

export function buildSSSTable(): SSSBracket[] {
  if (cachedTable) return cachedTable

  const table: SSSBracket[] = []

  // Below ₱4,250 → MSC ₱4,000
  const firstMsc = SSS_2024.MIN_MSC
  table.push({
    minSalary: 0,
    maxSalary: firstMsc + 249.99,
    msc: firstMsc,
    employeeShare: parseFloat((firstMsc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
    employerShare: parseFloat((firstMsc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
    ec: SSS_2024.EC_LOW,
    total: parseFloat((firstMsc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + SSS_2024.EC_LOW).toFixed(2)),
  })

  // ₱4,250 to ₱29,749.99 → MSC steps of ₱500
  for (let msc = firstMsc + SSS_2024.MSC_STEP; msc < SSS_2024.MAX_MSC; msc += SSS_2024.MSC_STEP) {
    const minSalary = msc - (SSS_2024.MSC_STEP / 2 - 0.01)
    const maxSalary = msc + (SSS_2024.MSC_STEP / 2 - 0.01)
    const ec = msc < SSS_2024.EC_THRESHOLD_MSC ? SSS_2024.EC_LOW : SSS_2024.EC_HIGH
    table.push({
      minSalary,
      maxSalary,
      msc,
      employeeShare: parseFloat((msc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
      employerShare: parseFloat((msc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
      ec,
      total: parseFloat((msc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + ec).toFixed(2)),
    })
  }

  // ₱29,750 and above → MSC ₱30,000
  const maxMsc = SSS_2024.MAX_MSC
  table.push({
    minSalary: SSS_2024.MAX_MSC - (SSS_2024.MSC_STEP / 2 - 0.01),
    maxSalary: Infinity,
    msc: maxMsc,
    employeeShare: parseFloat((maxMsc * SSS_2024.EMPLOYEE_RATE).toFixed(2)),
    employerShare: parseFloat((maxMsc * SSS_2024.EMPLOYER_RATE).toFixed(2)),
    ec: SSS_2024.EC_HIGH,
    total: parseFloat((maxMsc * (SSS_2024.EMPLOYEE_RATE + SSS_2024.EMPLOYER_RATE) + SSS_2024.EC_HIGH).toFixed(2)),
  })

  cachedTable = table
  return table
}

export function computeSSS(monthlySalary: number): {
  msc: number
  employeeShare: number
  employerShare: number
  ec: number
  total: number
} {
  const table = buildSSSTable()
  const bracket = table.find(b => monthlySalary >= b.minSalary && monthlySalary <= b.maxSalary)
    ?? table[table.length - 1]

  return {
    msc: bracket.msc,
    employeeShare: bracket.employeeShare,
    employerShare: bracket.employerShare,
    ec: bracket.ec,
    total: bracket.total,
  }
}

/**
 * SSS deduction per payroll period.
 * - Monthly: full deduction
 * - Semi-monthly: full amount on 1st cutoff (1-15), nothing on 2nd cutoff (16-end)
 */
export function getSSSForPeriod(
  monthlySalary: number,
  isFirstCutoff: boolean,
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY'
): { employee: number; employer: number; ec: number } {
  const result = computeSSS(monthlySalary)

  if (payFrequency === 'MONTHLY') {
    return { employee: result.employeeShare, employer: result.employerShare, ec: result.ec }
  }

  // Semi-monthly: deduct on first cutoff only
  if (isFirstCutoff) {
    return { employee: result.employeeShare, employer: result.employerShare, ec: result.ec }
  }

  return { employee: 0, employer: 0, ec: 0 }
}

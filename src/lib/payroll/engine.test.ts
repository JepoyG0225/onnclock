import { describe, it, expect } from 'vitest'
import { computePayroll } from './engine'
import type { PayrollInput } from './types'
import type { CategoryHours } from './premium-matrix'

function baseInput(over: Partial<PayrollInput> = {}): PayrollInput {
  return {
    employee: {
      id: 'e1',
      basicSalary: 17600,      // monthly
      dailyRate: 800,
      hourlyRate: 100,
      rateType: 'MONTHLY',
      payFrequency: 'SEMI_MONTHLY',
      isMinimumWageEarner: false,
      isExemptFromTax: true,    // isolate premiums from WHT noise
      sssEnabled: false,
      philhealthEnabled: false,
      pagibigEnabled: false,
      withholdingTaxEnabled: false,
      ...over.employee,
    } as PayrollInput['employee'],
    period: {
      start: new Date('2026-06-01'),
      end: new Date('2026-06-15'),
      workingDays: 11,
      payFrequency: 'SEMI_MONTHLY',
      isFirstCutoff: true,
      nightDifferentialRate: 0.1,
      ...over.period,
    } as PayrollInput['period'],
    attendance: {
      daysWorked: 11,           // full period → basic = full half-month salary
      regularHours: 88,
      regularOtHours: 0,
      restDayOtHours: 0,
      regularHolidayOtHours: 0,
      specialHolidayOtHours: 0,
      nightDiffHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      absentDays: 0,
      regularHolidaysWorked: 0,
      specialHolidaysWorked: 0,
      ...over.attendance,
    } as PayrollInput['attendance'],
    loans: [],
    deMinimis: { riceSubsidy: 0, clothing: 0, medical: 0, laundry: 0, meal: 0, other: 0 },
    allowances: { rice: 0, clothing: 0, medical: 0, transportation: 0, other: 0 },
    additionalTaxableIncome: 0,
    additionalNonTaxableIncome: 0,
    ytd: { grossPay: 0, taxableIncome: 0, withholdingTax: 0, thirteenthMonthContrib: 0 },
  }
}

describe('computePayroll — MKG night shift into legal holiday (premium matrix)', () => {
  // hourly rate 100. MKG shift split: 2h ordinary ND, 6h LHND, 1h LH.
  const premiums: CategoryHours = {
    ORDINARY_ND: 2,
    REGULAR_HOLIDAY_ND: 6,
    REGULAR_HOLIDAY: 1,
  }

  it('prices LHND/LH/ND on top of basic without double-counting', () => {
    const r = computePayroll(baseInput({ attendance: { premiums } as never }))
    // ND increments: 2h×(0.1×100) + 6h×(0.2×100) = 20 + 120 = 140
    expect(r.nightDiffAmount).toBeCloseTo(140, 2)
    // Holiday premium (excl ND): (1h LH + 6h LHND holiday-portion) × 100 = 700
    expect(r.holidayPayAmount).toBeCloseTo(700, 2)
    // Itemized lines persisted
    const cats = (r.premiumLineItems ?? []).map(l => l.category).sort()
    expect(cats).toEqual(['ORDINARY_ND', 'REGULAR_HOLIDAY', 'REGULAR_HOLIDAY_ND'])
    // Gross = basic (full half-month = 8800) + premiums (140 + 700)
    expect(r.basicPay).toBeCloseTo(8800, 2)
    expect(r.grossPay).toBeCloseTo(8800 + 140 + 700, 2)
  })

  it('legacy path (no premiums) is unchanged — zero premiums here', () => {
    const r = computePayroll(baseInput())
    expect(r.nightDiffAmount).toBe(0)
    expect(r.holidayPayAmount).toBe(0)
    expect(r.premiumLineItems).toBeUndefined()
    expect(r.grossPay).toBeCloseTo(8800, 2)
  })
})

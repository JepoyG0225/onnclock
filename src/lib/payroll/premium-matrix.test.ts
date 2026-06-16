import { describe, it, expect } from 'vitest'
import {
  classifyShiftHours,
  priceShiftPremiums,
  PREMIUM_MULTIPLIERS,
  type HolidayClass,
} from './premium-matrix'

// Build a PHT Date from "YYYY-MM-DDTHH:mm" (interpreted as +08:00).
const pht = (s: string) => new Date(`${s}:00+08:00`)

const noRestDay = () => false
const noHoliday: () => HolidayClass = () => 'NONE'

describe('classifyShiftHours — ordinary night shift (no holiday)', () => {
  it('22:00 → 06:00, 1h break, splits ND vs regular and caps OT', () => {
    const h = classifyShiftHours({
      timeIn: pht('2026-06-09T22:00'),
      timeOut: pht('2026-06-10T06:00'), // 8h span, 1h break => 7h paid
      allowedBreakMinutes: 60,
      regularCapMinutes: 8 * 60,
      holidayFor: noHoliday,
      isRestDayDate: noRestDay,
    })
    // Entire paid window is inside 22:00–06:00 ND window → all ND, no OT.
    expect(h.ORDINARY_ND).toBeCloseTo(7, 1)
    expect(h.ORDINARY ?? 0).toBe(0)
    expect(h.ORDINARY_OT ?? 0).toBe(0)
  })
})

describe('classifyShiftHours — MKG case: shift crosses into a legal holiday', () => {
  // Clock-in June 11 22:00, clock-out June 12 07:00. June 12 is a REGULAR
  // (legal) holiday. ND window 22:00–06:00. No break for a clean assertion.
  const holidayJun12: (k: string) => HolidayClass = (k) =>
    k === '2026-06-12' ? 'REGULAR' : 'NONE'

  it('produces ORDINARY_ND (pre-midnight) + LHND + LH', () => {
    const h = classifyShiftHours({
      timeIn: pht('2026-06-11T22:00'),
      timeOut: pht('2026-06-12T07:00'), // 9h, no break
      allowedBreakMinutes: 0,
      regularCapMinutes: 9 * 60, // treat all as regular (no OT) for clarity
      holidayFor: holidayJun12,
      isRestDayDate: noRestDay,
    })
    // 22:00–24:00 (June 11, not holiday, ND)  → 2h ORDINARY_ND
    expect(h.ORDINARY_ND).toBeCloseTo(2, 2)
    // 00:00–06:00 (June 12 holiday, ND)       → 6h LHND
    expect(h.REGULAR_HOLIDAY_ND).toBeCloseTo(6, 2)
    // 06:00–07:00 (June 12 holiday, not ND)   → 1h LH
    expect(h.REGULAR_HOLIDAY).toBeCloseTo(1, 2)
    // No plain ordinary/regular daytime hours
    expect(h.ORDINARY ?? 0).toBe(0)
  })

  it('prices LHND at 220% and LH at 200% of base', () => {
    const h = classifyShiftHours({
      timeIn: pht('2026-06-11T22:00'),
      timeOut: pht('2026-06-12T07:00'),
      allowedBreakMinutes: 0,
      regularCapMinutes: 9 * 60,
      holidayFor: holidayJun12,
      isRestDayDate: noRestDay,
    })
    const rows = priceShiftPremiums(h, 100) // base hourly = 100
    const by = Object.fromEntries(rows.map(r => [r.category, r]))
    expect(by.REGULAR_HOLIDAY_ND.amount).toBeCloseTo(6 * 100 * 2.2, 2)  // 1320
    expect(by.REGULAR_HOLIDAY.amount).toBeCloseTo(1 * 100 * 2.0, 2)     // 200
    expect(by.ORDINARY_ND.amount).toBeCloseTo(2 * 100 * 1.1, 2)        // 220
  })
})

describe('classifyShiftHours — OT split', () => {
  it('day shift 08:00–19:00 with 1h break, 8h cap → 2h OT', () => {
    const h = classifyShiftHours({
      timeIn: pht('2026-06-09T08:00'),
      timeOut: pht('2026-06-09T19:00'), // 11h span − 1h break = 10h paid
      allowedBreakMinutes: 60,
      regularCapMinutes: 8 * 60,
      holidayFor: noHoliday,
      isRestDayDate: noRestDay,
    })
    expect(h.ORDINARY).toBeCloseTo(8, 1)
    expect(h.ORDINARY_OT).toBeCloseTo(2, 1)
    expect(h.ORDINARY_ND ?? 0).toBe(0)
  })
})

describe('PREMIUM_MULTIPLIERS — DOLE spot checks', () => {
  it('LHND = 2.2, RH = 2.0, ordinary ND = 1.1', () => {
    expect(PREMIUM_MULTIPLIERS.REGULAR_HOLIDAY_ND).toBe(2.2)
    expect(PREMIUM_MULTIPLIERS.REGULAR_HOLIDAY).toBe(2.0)
    expect(PREMIUM_MULTIPLIERS.ORDINARY_ND).toBe(1.1)
    expect(PREMIUM_MULTIPLIERS.REGULAR_HOLIDAY_RD_OT_ND).toBeCloseTo(3.718, 3)
  })
})

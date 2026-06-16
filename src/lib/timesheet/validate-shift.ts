/**
 * Validate a planned shift's timeIn / timeOut pair.
 * Returns null when valid, or a human-readable error message string.
 *
 * Catches the Loyola K-12 style bad-data cases at the API layer:
 *   - zero-length shift (timeIn === timeOut)
 *   - malformed HH:MM strings
 *   - shifts longer than 16 hours (almost always a typo, e.g. 00:00→21:00)
 *
 * Intended to be called from every route that creates or updates a
 * WorkSchedule template or per-date EmployeeShiftAssignment.
 */
export function validateShiftTimes(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): string | null {
  if (!timeIn && !timeOut) return null // no schedule times = nothing to validate
  if (!timeIn || !timeOut) return 'Both shift start and end times are required'
  const re = /^([01]?\d|2[0-3]):([0-5]\d)$/
  const inMatch = re.exec(timeIn.trim())
  const outMatch = re.exec(timeOut.trim())
  if (!inMatch || !outMatch) return 'Shift times must be in HH:MM 24-hour format'
  const inMins = Number(inMatch[1]) * 60 + Number(inMatch[2])
  const outMins = Number(outMatch[1]) * 60 + Number(outMatch[2])
  if (inMins === outMins) {
    return 'Shift start and end times cannot be the same (zero-length shift)'
  }
  // Span treats overnight (out <= in) as next-day wrap.
  const span = outMins > inMins ? outMins - inMins : 24 * 60 - (inMins - outMins)
  if (span > 16 * 60) {
    return (
      `Shift duration is ${(span / 60).toFixed(1)} hours, which exceeds the 16-hour maximum. ` +
      `If this is two shifts, create them as separate assignments instead.`
    )
  }
  return null
}

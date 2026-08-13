/**
 * My Attendance — the punch control plus the full month-by-month record.
 *
 * The implementation lives in PunchClock so the home screen can render the same
 * control and punch directly, rather than linking here.
 */
import { PunchClock } from '@/components/employee/PunchClock'

export default function ClockPage() {
  return <PunchClock showHistory />
}

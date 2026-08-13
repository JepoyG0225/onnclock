import { redirect } from 'next/navigation'

/**
 * /portal/attendance is retired — the month-by-month history it held now lives
 * on /portal/clock, so an employee sees today's punch and their record in one
 * place instead of two.
 *
 * Kept as a redirect rather than deleted: the path is in browser history, may
 * be bookmarked, and older builds of the mobile app link to it.
 */
export default function LegacyAttendancePage() {
  redirect('/portal/clock')
}

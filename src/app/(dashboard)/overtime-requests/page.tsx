/**
 * Moved into the tabbed /timesheets page.
 *
 * Kept as a redirect rather than deleted: notification deep-links, the
 * onboarding tour, payroll cross-links and user bookmarks all still point
 * here, and any of those 404-ing would be a worse regression than the
 * duplicate route.
 */
import { redirect } from 'next/navigation'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Forward whatever query the caller sent (week pickers, employee filters)
  // so a deep link keeps its context through the redirect.
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  // Overtime is no longer its own view — it's approved inline on a timesheet.
  params.set('tab', 'timesheets')
  redirect(`/timesheets?${params.toString()}`)
}

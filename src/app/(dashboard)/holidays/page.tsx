/**
 * Moved into the tabbed /schedules page. Kept as a redirect rather than deleted so
 * bookmarks, notification deep-links and in-app cross-links keep working.
 */
import { redirect } from 'next/navigation'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  params.set('tab', 'holidays')
  redirect(`/schedules?${params.toString()}`)
}

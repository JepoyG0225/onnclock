/**
 * Performance — reviews, disciplinary records and tardiness.
 *
 * A SERVER component so the HRIS-Pro check runs where the session lives; the
 * resolved flag is handed to the client tab shell, which gates the two tabs
 * that were Pro-gated before the merge. Tardiness was never gated and stays
 * open — see the note in PerformanceTabs.
 */
import { getHrisProEnabled } from '@/lib/hris-pro-access'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'

export default async function PerformancePage() {
  const hrisProEnabled = await getHrisProEnabled()
  return <PerformanceTabs hrisProEnabled={hrisProEnabled} />
}

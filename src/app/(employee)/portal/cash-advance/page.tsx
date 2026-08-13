import { redirect } from 'next/navigation'

/** Merged into /portal/loans. Kept so notification deep-links survive. */
export default function LegacyCashAdvancePage() {
  redirect('/portal/loans?tab=cash-advance')
}

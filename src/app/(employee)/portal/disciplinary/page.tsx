import { redirect } from 'next/navigation'

/** Merged into /portal/performance. Kept so notification deep-links survive. */
export default function LegacyDisciplinaryPage() {
  redirect('/portal/performance?tab=disciplinary')
}

/**
 * Tax Annualization has been merged into the BIR Reports page as a
 * new "Annualization" tab. We keep this route as a permanent redirect
 * so old bookmarks / direct links don't 404.
 */
import { redirect } from 'next/navigation'

export default function TaxAnnualizationRedirect() {
  redirect('/reports/bir?tab=annualization')
}

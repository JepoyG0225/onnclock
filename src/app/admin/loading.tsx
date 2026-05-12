import { AppSpinner } from '@/components/ui/AppSpinner'

/** Shared loader for /admin/* routes (system-admin panel). */
export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 160px)' }}>
      <AppSpinner size="lg" message="Loading…" />
    </div>
  )
}

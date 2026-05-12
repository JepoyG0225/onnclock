import { AppSpinner } from '@/components/ui/AppSpinner'

/** Shared loader for /portal/* (employee self-service) routes. */
export default function PortalLoading() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <AppSpinner size="lg" message="Loading…" />
    </div>
  )
}

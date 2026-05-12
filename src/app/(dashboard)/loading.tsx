import { AppSpinner } from '@/components/ui/AppSpinner'

/**
 * Shared loading state for all routes in the (dashboard) route group.
 * Renders inside the dashboard layout (sidebar + header stay visible) so
 * users get a brand-aware spinner instead of a layout-shifting skeleton
 * while the page chunk + data hydrate.
 */
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 160px)' }}>
      <AppSpinner size="lg" message="Loading…" />
    </div>
  )
}

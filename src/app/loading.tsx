import { AppSpinner } from '@/components/ui/AppSpinner'

export default function Loading() {
  return <div className="flex min-h-[60vh] items-center justify-center"><AppSpinner size="lg" message="Loading…" /></div>
}

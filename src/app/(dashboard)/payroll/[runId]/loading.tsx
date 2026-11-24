import { AppSpinner } from '@/components/ui/AppSpinner'

export default function PayrollRunLoading() {
  return <div className="flex min-h-[60vh] items-center justify-center"><AppSpinner size="lg" message="Loading payroll run..." /></div>
}

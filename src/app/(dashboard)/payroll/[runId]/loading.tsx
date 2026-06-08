/**
 * Skeleton shown while the payroll-run detail page is fetching its
 * server-side data (PayrollRun, Company, Approvers, Holidays, DTRs,
 * Payslips). Next.js renders this automatically during the route
 * transition, so the user sees the page shape immediately after
 * clicking the row's View button instead of staring at a frozen list.
 */
export default function PayrollRunLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-44 rounded bg-slate-200" />
            <div className="h-4 w-72 rounded bg-slate-100" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-6 w-20 rounded-full bg-slate-200" />
            <div className="h-8 w-32 rounded-md bg-slate-200" />
            <div className="h-8 w-40 rounded-md bg-slate-200" />
            <div className="h-8 w-8 rounded-md bg-slate-200" />
          </div>
        </div>
        {/* Workflow stepper skeleton */}
        <div className="flex items-center w-full py-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex items-center ${i < 4 ? 'flex-1' : ''}`}>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-5 h-5 rounded-full bg-slate-200" />
                <div className="h-3 w-16 rounded bg-slate-100" />
              </div>
              {i < 4 && <div className="hidden sm:block flex-1 h-0.5 mx-2 rounded bg-slate-100" />}
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-16 rounded bg-slate-100" />
              <div className="h-5 w-24 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>

      {/* Employer contributions skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="h-4 w-56 rounded bg-slate-200" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center p-3 rounded-lg bg-slate-50 space-y-2">
              <div className="h-3 w-24 mx-auto rounded bg-slate-200" />
              <div className="h-5 w-28 mx-auto rounded bg-slate-300" />
            </div>
          ))}
        </div>
      </div>

      {/* Payslip table skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-100">
          <div className="h-4 w-48 rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="h-8 w-8 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-3 w-28 rounded bg-slate-100" />
              </div>
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

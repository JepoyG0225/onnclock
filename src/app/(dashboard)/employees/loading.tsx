export default function EmployeesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-slate-100 rounded-full" />
          <div className="h-7 w-40 bg-slate-200 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-xl" />
      </div>
      {/* Filters */}
      <div className="flex gap-3">
        {[160, 120, 120].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-9 bg-slate-100 rounded-lg" />
        ))}
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="h-11 bg-slate-50 border-b border-slate-100" />
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50">
            <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 bg-slate-100 rounded-full" />
              <div className="h-2.5 w-24 bg-slate-100 rounded-full" />
            </div>
            <div className="h-3 w-24 bg-slate-100 rounded-full hidden md:block" />
            <div className="h-6 w-16 bg-slate-100 rounded-full hidden lg:block" />
            <div className="h-3 w-20 bg-slate-100 rounded-full hidden xl:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

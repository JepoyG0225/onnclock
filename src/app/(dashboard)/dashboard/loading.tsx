export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">

      {/* Welcome banner skeleton */}
      <div className="rounded-2xl h-24 bg-gradient-to-br from-[#2E4156]/80 via-[#2E4156]/80 to-[#1A2D42]/80" />

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border-0 shadow-sm p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-3 w-24 bg-slate-100 rounded-full" />
              <div className="w-8 h-8 bg-slate-100 rounded-lg" />
            </div>
            <div className="h-8 w-16 bg-slate-100 rounded-lg" />
            <div className="h-2 w-20 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>

      {/* Today's highlights */}
      <div>
        <div className="h-3 w-32 bg-slate-100 rounded-full mb-3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-100 rounded-lg" />
                <div className="h-3 w-28 bg-slate-100 rounded-full" />
              </div>
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex items-center gap-3 p-2">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-28 bg-slate-100 rounded-full" />
                    <div className="h-2 w-20 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Remittance */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="h-3 w-48 bg-slate-100 rounded-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-50 rounded-xl border border-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}


export default function DtrLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-slate-100 rounded-full" />
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
        </div>
        <div className="h-10 w-32 bg-slate-200 rounded-xl" />
      </div>
      <div className="flex gap-3">
        {[180, 120, 100].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-9 bg-slate-100 rounded-lg" />
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="h-11 bg-slate-50 border-b border-slate-100" />
        {[...Array(12)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50">
            <div className="h-3 w-28 bg-slate-100 rounded-full" />
            <div className="h-3 w-20 bg-slate-100 rounded-full hidden md:block" />
            <div className="h-3 w-20 bg-slate-100 rounded-full hidden md:block" />
            <div className="ml-auto h-6 w-16 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SettingsLoading() {
  return (
    <div className="space-y-5 animate-pulse max-w-2xl">
      <div className="space-y-2">
        <div className="h-3 w-20 bg-slate-100 rounded-full" />
        <div className="h-7 w-32 bg-slate-200 rounded-lg" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-28 bg-slate-100 rounded-full" />
            <div className="h-10 w-full bg-slate-100 rounded-lg" />
          </div>
        ))}
        <div className="h-10 w-32 bg-slate-200 rounded-xl mt-4" />
      </div>
    </div>
  )
}

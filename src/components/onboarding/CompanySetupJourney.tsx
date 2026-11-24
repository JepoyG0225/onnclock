"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Compass, ArrowRight, RefreshCw, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { SetupStep } from '@/lib/onboarding/setup-journey'

type Step = SetupStep & { done: boolean }
type Progress = { steps: Step[]; canEdit: boolean }
export function CompanySetupJourney({ companyId }: { companyId: string }) {
  const pathname = usePathname(), router = useRouter()
  const [data, setData] = useState<Progress | null>(null)
  const [open, setOpen] = useState(false), [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const seq = ++sequence.current; setLoading(true)
    try {
      const res = await fetch('/api/setup-journey', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      const body = await res.json()
      if (!res.ok) throw Error(body.error || 'Unable to load setup progress.')
      if (seq === sequence.current) { setData(body); setError('') }
    } catch (e) { if (seq === sequence.current) setError(e instanceof Error ? e.message : 'Unable to load progress.') }
    finally { if (seq === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load, companyId, pathname])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', refresh)
    const timer = active || open ? setInterval(refresh, 30000) : null
    return () => { window.removeEventListener('focus', refresh); if (timer) clearInterval(timer) }
  }, [load, active, open])
  useEffect(() => { try { setActive(sessionStorage.getItem(`setup-step:${companyId}`)) } catch {} }, [companyId])
  function select(id: string | null) { setActive(id); try { if (id) sessionStorage.setItem(`setup-step:${companyId}`, id); else sessionStorage.removeItem(`setup-step:${companyId}`) } catch {} }
  const steps = data?.steps ?? [], done = steps.filter(s => s.done).length
  const percent = steps.length ? Math.round(done / steps.length * 100) : 0
  const current = steps.find(s => s.id === active), next = steps.find(s => !s.done)
  function guide(step: Step) { select(step.id); setOpen(false); router.push(step.href) }
  async function mark(step: Step, complete: boolean) {
    if (saving || !data?.canEdit || step.automatic) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/setup-journey', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: step.id, done: complete }) })
      if (!res.ok) throw Error((await res.json()).error || 'Unable to save progress.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save progress.') }
    finally { setSaving(false) }
  }
  return <>
    {current && !open && <section aria-label="Current setup step" className="fixed bottom-20 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-blue-100 bg-white p-4 shadow-xl">
      <button onClick={() => select(null)} aria-label="Pause setup guide" className="absolute right-3 top-3 rounded p-1 text-slate-500"><X className="h-4 w-4" /></button>
      <p className="pr-6 text-xs font-semibold uppercase tracking-wide text-blue-700">{current.module}</p>
      <h2 className="mt-1 pr-6 text-sm font-bold text-[#162d54]">{current.title}</h2>
      <p className="mt-2 text-xs leading-5 text-slate-600">{current.description}</p>
      <p className="mt-2 text-xs text-slate-500">{current.done ? 'Completed. Ready for the next step.' : current.automatic ? 'Checks saved records automatically. Save your changes, then refresh progress.' : 'Open this module, review the setup, then mark it reviewed.'}</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-lg border px-3 py-2 text-xs" onClick={() => router.push(current.href)}>Open module</button>
        {current.done ? next ? <button className="rounded-lg bg-[#162d54] px-3 py-2 text-xs text-white" onClick={() => guide(next)}>Next step</button> : <button className="rounded-lg bg-[#162d54] px-3 py-2 text-xs text-white" onClick={() => { select(null); setOpen(true) }}>View completed setup</button> : current.automatic ? <button disabled={loading} className="rounded-lg bg-[#162d54] px-3 py-2 text-xs text-white disabled:opacity-50" onClick={() => void load()}>Check progress</button> : data?.canEdit && <button disabled={saving} className="rounded-lg bg-[#162d54] px-3 py-2 text-xs text-white disabled:opacity-50" onClick={() => void mark(current, true)}>Mark reviewed</button>}
      </div>
    </section>}
    <button onClick={() => { setOpen(true); void load() }} aria-label="Open company setup journey" className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[#162d54] px-4 py-3 text-sm font-semibold text-white shadow-lg ring-2 ring-white transition hover:bg-[#0054d7]">
      <Compass className="h-5 w-5" /> Setup guide {data && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{percent}%</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="mx-3 max-w-2xl p-0 [&>div]:p-0">
      <div role="dialog" aria-modal="true" aria-labelledby="setup-title" className="flex max-h-[85dvh] flex-col overflow-hidden rounded-2xl">
        <header className="bg-[#162d54] p-5 pr-12 text-white">
          <p className="text-xs font-medium text-white/70">YOUR COMPANY SETUP</p><h2 id="setup-title" className="mt-1 text-xl font-bold">Let's get your team ready</h2>
          <p className="mt-2 text-sm text-white/80">Follow the checklist at your own pace. Progress is shared with your company admins.</p>
          <div className="mt-4 flex justify-between text-xs"><span>{done} of {steps.length} steps completed</span><span>{percent}%</span></div>
          <div role="progressbar" aria-label="Company setup completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#ff5900] transition-all" style={{ width: `${percent}%` }} /></div>
        </header>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          {next ? <button onClick={() => guide(next)} className="flex items-center gap-2 rounded-lg bg-[#0054d7] px-4 py-2 text-sm font-semibold text-white">{done ? 'Continue setup' : 'Start setup'}<ArrowRight className="h-4 w-4" /></button> : <span className="text-sm font-semibold text-[#162d54]">{data && steps.length ? 'Setup complete!' : 'Loading your checklist...'}</span>}
          <button disabled={loading} onClick={() => void load()} aria-label="Refresh setup progress" className="rounded-lg border p-2 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="overflow-y-auto p-5">
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="mb-4 text-xs text-slate-500">Only modules included in your plan and access are shown. Saved records complete automatic steps; review steps confirm you have checked the module. No sample financial transactions are required.</p>
          {[...new Set(steps.map(s => s.module))].map(module => { const items = steps.filter(s => s.module === module); return <details key={module} open={items.some(s => !s.done)} className="mb-3 rounded-xl border border-slate-200">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#162d54]">{module}<span className="ml-2 text-xs font-normal text-slate-500">{items.filter(s => s.done).length}/{items.length}</span></summary>
            <ul className="divide-y border-t">{items.map(step => <li key={step.id} className="flex gap-3 p-4">
              {step.done ? <CheckCircle2 aria-label="Completed" className="mt-0.5 h-5 w-5 shrink-0 text-[#c74300]" /> : <Circle aria-label="Not completed" className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{step.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p><div className="mt-2 flex flex-wrap items-center gap-3"><button onClick={() => guide(step)} className="text-xs font-semibold text-blue-700">{step.done ? 'Open module' : 'Guide me'} &rarr;</button><span className="text-[11px] text-slate-400">{step.automatic ? 'Auto-checked from records' : 'Review checklist'}</span>{step.done && !step.automatic && data?.canEdit && <button disabled={saving} onClick={() => void mark(step, false)} className="text-xs text-slate-500 underline">Undo review</button>}</div></div>
            </li>)}</ul>
          </details> })}
        </div>
      </div>
    </DialogContent></Dialog>
  </>
}

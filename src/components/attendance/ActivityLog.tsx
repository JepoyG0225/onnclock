'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SwitchCamera, Camera, AlertTriangle } from 'lucide-react'
import { ActivityLocation, type ActivityLocationData } from './ActivityLocation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const activityDialogClass = 'mx-2 w-[calc(100%_-_1rem)] max-w-2xl max-h-[92dvh] overflow-y-auto overscroll-contain sm:mx-4 sm:w-full [&>div.p-6]:p-4 sm:[&>div.p-6]:p-6 [&>button]:h-11 [&>button]:w-11 [&>button]:right-1 [&>button]:top-1 [&>button]:flex [&>button]:items-center [&>button]:justify-center'

export type Activity = ActivityLocationData & { id: string; notes?: string | null; description: string; loggedAt: string; dtrRecordId: string; photoUrls?: string[]; photoUrl: string | null; dailyNumber: number }
export const activityTime = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
export function ActivityLogPopup() {
  const [open, setOpen] = useState(false)
  return <div className="flex justify-center">
    <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">Activity Log</Button>
    {open && <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={activityDialogClass}>
        <DialogHeader><DialogTitle>Activity Log</DialogTitle></DialogHeader>
        <ActivityLog showMonthFilter={false} compact />
      </DialogContent>
    </Dialog>}
  </div>
}
export function TimesheetActivities({ dtrRecordId }: { dtrRecordId: string }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" className="mt-2 text-xs text-blue-600 underline" onClick={() => setOpen(true)}>Activities</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className={activityDialogClass}><DialogHeader><DialogTitle>Timesheet activities</DialogTitle></DialogHeader>{open && <ActivityLog dtrRecordId={dtrRecordId} />}</DialogContent></Dialog></>
}
export function ActivityItems({ activities }: { activities: Activity[] }) {
  const [photo, setPhoto] = useState<string | null>(null)
  return <><div className="space-y-3">{activities.map(a => <article key={a.id} className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 via-white to-blue-50/30 p-3">
    <span aria-label={`Activity ${a.dailyNumber}`} className="mb-2 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-emerald-100 px-2 text-sm font-bold tabular-nums text-emerald-800">{a.dailyNumber}</span>
    <br />
    <time className="text-xs text-gray-500" dateTime={a.loggedAt}>{activityTime(a.loggedAt)} · Philippine time</time>
    <p className="whitespace-pre-wrap break-words text-sm mt-1">{a.description}</p>
    {a.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600"><span className="font-semibold">Notes: </span>{a.notes}</p>}
    <ActivityLocation activity={a} />
    <div className="grid grid-cols-2 gap-2">{(a.photoUrls ?? (a.photoUrl ? [a.photoUrl] : [])).map((url,index)=><button key={url} type="button" onClick={()=>setPhoto(url)} className="mt-3 block w-full" aria-label={`Enlarge activity photo ${index+1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Activity photo ${index+1}`} loading="lazy" className="max-h-56 w-full rounded-lg object-contain bg-slate-50"/>
    </button>)}</div>
  </article>)}</div><Dialog open={!!photo} onOpenChange={open => { if (!open) setPhoto(null) }}><DialogContent><DialogHeader><DialogTitle>Activity photo</DialogTitle></DialogHeader>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {photo && <img src={photo} alt="Activity attachment" className="max-h-[70vh] w-full object-contain" />}
  </DialogContent></Dialog></>
}
export default function ActivityLog({ dtrRecordId, readOnly = false, showMonthFilter = true, compact = false }: { dtrRecordId?: string; readOnly?: boolean; showMonthFilter?: boolean; compact?: boolean }) {
  const [activities, setActivities] = useState<Activity[]>([]), [active, setActive] = useState<string | null>(null)
  const [hasLoaded,setHasLoaded]=useState(false)
  const [shiftTotal, setShiftTotal] = useState<number | null>(null)
  const [shiftLabel, setShiftLabel] = useState('This shift')
  const [notes, setNotes] = useState('')
  const [description, setDescription] = useState(''), [photos, setPhotos] = useState<string[]>([])
  const photo = photos[0] ?? null
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()))
  const [page, setPage] = useState(1), [count, setCount] = useState(0), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const requestId = useRef<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false), [cameraReady, setCameraReady] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment')
  const [canSwitchCamera, setCanSwitchCamera] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const canLog = !!active && !loading && !readOnly && !dtrRecordId
  useEffect(() => {
    if (!canLog) { setCameraOpen(false); setCameraReady(false) }
  }, [canLog])
  useEffect(() => {
    if (!cameraOpen || !canLog) return
    let stopped = false, stream: MediaStream | null = null
    setCameraReady(false)
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 } }, audio: false }).then(media => {
      if (stopped) { media.getTracks().forEach(track => track.stop()); return }
      stream = media
      void navigator.mediaDevices.enumerateDevices().then(devices => {
        if (!stopped) setCanSwitchCamera(devices.filter(device => device.kind === 'videoinput').length > 1)
      }).catch(() => { if (!stopped) setCanSwitchCamera(true) })
      if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => {}) }
    }).catch(() => { if (stopped) return; setError('Camera access is unavailable. Allow camera permission and try again.'); setCameraOpen(false) })
    if (!navigator.mediaDevices) { setError('Camera capture requires a supported browser over HTTPS.'); setCameraOpen(false) }
    return () => { stopped = true; stream?.getTracks().forEach(track => track.stop()) }
  }, [cameraOpen, cameraFacing, canLog])
  function capture() {
    if (!canLog || !cameraReady || !video.current?.videoWidth) return
    const scale = Math.min(1, 960 / Math.max(video.current.videoWidth, video.current.videoHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(video.current.videoWidth * scale); canvas.height = Math.round(video.current.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video.current, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL('image/jpeg', 0.65)
    if (result.length > 2_000_000) { setError('Photo is too large. Try a different capture.'); return }
    setPhotos(current => [...current, result].slice(0,5)); setCameraOpen(false)
  }
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ month, page: String(page), ...(dtrRecordId ? { dtrRecordId } : {}) })
      const response = await fetch(`/api/attendance/activities?${query}`, { cache: 'no-store' })
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Could not load activities.')
      setHasLoaded(true); setShiftTotal(data.shiftTotal ?? null); setShiftLabel(data.shiftLabel ?? 'This shift'); setActivities(data.activities); setCount(data.count); setActive(data.activeDtr?.id ?? null)
    } catch (e) { setShiftTotal(null); setActive(null); setError(e instanceof Error ? e.message : 'Could not load activities.') }
    finally { setLoading(false) }
  }, [dtrRecordId, month, page])
  useEffect(() => { void load() }, [load])
  async function captureLocation(): Promise<ActivityLocationData | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, locationAccuracy: position.coords.accuracy, locationCapturedAt: new Date(position.timestamp).toISOString() }), () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 })
    })
  }
  async function save() {
    if (!canLog || busy || !description.trim()) return
    if (!photo) { setError('Take a photo before logging this activity.'); return }
    setBusy(true); setError(''); setNotice(''); requestId.current ??= crypto.randomUUID()
    try {
      const location = await captureLocation()
      const response = await fetch('/api/attendance/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: requestId.current, dtrRecordId: active, description, notes, ...(location ? { location } : {}), ...(photo ? { photo, photos, photoSource: 'camera' } : {}) }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Could not save activity.')
      setDescription(''); setNotes(''); setPhotos([]); requestId.current = null; setNotice(location ? 'Activity saved with timestamp and location.' : 'Activity saved. Location was unavailable; enable location permission to include it next time.'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save activity. You can retry safely.') }
    finally { setBusy(false) }
  }
  return <section className={compact ? "min-w-0 space-y-4" : "min-w-0 rounded-xl border border-blue-100 bg-white p-3 sm:p-4 space-y-4 mb-5"}>
    <div className="flex justify-between gap-2 items-center"><h2 className="font-semibold text-emerald-800">Daily activities</h2><Button type="button" size="sm" className="min-h-11 shrink-0" variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button></div>
    {hasLoaded && shiftTotal !== null && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-emerald-50 px-4 py-3 text-blue-800"><span className="text-sm font-medium">{shiftLabel} total logs</span><strong className="text-xl tabular-nums">{shiftTotal}</strong></div>}
    {hasLoaded && !dtrRecordId && <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800"><span className="text-sm font-medium">{month} total activity logs</span><strong className="text-xl tabular-nums">{count}</strong></div>}
    {!dtrRecordId && !readOnly && <><p className="text-sm text-gray-500">Log your work while clocked in. Each entry is saved with a timestamp and linked to your timesheet. Your current location is requested when you save.</p>
      {loading ? <p role="status" className="text-sm text-gray-500">Checking your attendance...</p> : !active && <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" /><div><p className="font-semibold">Clock in first</p><p className="mt-1 text-sm">You must clock in before adding an activity or taking a photo. After clocking in, reopen Activity Log or tap Refresh.</p></div></div>}
      <label className="block text-sm">Activity<textarea disabled={!canLog || busy} value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} placeholder="What are you working on?" className="mt-2 border rounded-xl w-full p-3 min-h-32 text-base resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" /></label>
      <label className="block text-sm">Notes (optional)<textarea disabled={!canLog || busy} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Add details or remarks" className="mt-2 border rounded-xl w-full p-3 min-h-24 text-base resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" /></label>
      <div className="space-y-2"><p className="text-sm font-medium">Photo <span className="font-normal text-gray-500">(required)</span></p><div className="grid grid-cols-1 gap-2"><Button type="button" className="h-12 px-2" variant="outline" disabled={!canLog || busy || photos.length >= 5} onClick={() => { if (!canLog) return; setCameraReady(false); setCanSwitchCamera(false); setError(''); setCameraOpen(true) }}><Camera className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />Take photo ({photos.length}/5)</Button>
      </div></div>
      <div className="grid grid-cols-2 gap-2">{photos.map((image,index)=><div key={index}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`Activity photo ${index+1}`} className="h-36 w-full rounded-xl object-contain bg-slate-50"/><Button type="button" size="sm" variant="outline" className="mt-1 w-full" disabled={busy} onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}>Remove {index+1}</Button></div>)}</div>
      {!photo && <p className="text-sm text-slate-500">Take a photo to enable Log activity.</p>}
      <Button type="button" className="w-full min-h-12 text-base" disabled={!canLog || busy || !description.trim() || !photo} onClick={() => void save()}>{busy ? 'Saving…' : 'Log activity'}</Button>
    </>}
    {!dtrRecordId && showMonthFilter && <label className="flex flex-col gap-2 text-sm border-t pt-3 sm:flex-row sm:items-center">View month<input type="month" className="min-w-0 w-full sm:w-auto rounded-lg border p-3 text-base" value={month} onChange={e => { setMonth(e.target.value); setPage(1) }} /></label>}
    <Dialog open={cameraOpen} onOpenChange={setCameraOpen}><DialogContent className={activityDialogClass}><DialogHeader><DialogTitle>Capture activity photo</DialogTitle></DialogHeader><video key={cameraFacing} ref={video} autoPlay playsInline muted onLoadedData={() => setCameraReady(true)} className="w-full max-h-[55dvh] rounded-xl bg-slate-950 object-contain" /><div className="mt-4 grid grid-cols-1 min-[380px]:grid-cols-2 gap-2"><Button type="button" className="min-h-12" disabled={!canLog || !cameraReady} onClick={capture}>Capture photo</Button>{canSwitchCamera && <Button type="button" variant="outline" className="min-h-12" disabled={!canLog || !cameraReady} onClick={() => { setCameraReady(false); setCameraFacing(current => current === 'environment' ? 'user' : 'environment') }}><SwitchCamera className="mr-2 h-4 w-4" aria-hidden="true" />Switch camera</Button>}</div></DialogContent></Dialog>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {loading ? <AppSpinner size="md" message="Loading activities…" className="py-8" /> : activities.length ? <ActivityItems activities={activities} /> : <p className="text-sm text-gray-500">No activities logged.</p>}
    {count > 50 && <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-xs">Page {page} of {Math.ceil(count / 50)}</span><Button variant="outline" disabled={page * 50 >= count || loading} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
  </section>
}

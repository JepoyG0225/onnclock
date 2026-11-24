"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceMeshScanner } from '@/components/employee/FaceMeshScanner'
import { FACE_MODEL_ID, warmFaceApi } from '@/lib/face/face-api'
import { Button } from '@/components/ui/button'
import { ScanFace, Pointer } from 'lucide-react'
import './kiosk.css'
import { Input } from '@/components/ui/input'

class KioskRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}
async function api(path: string, body?: unknown) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch(`/api/office-kiosk/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json()
    if (!response.ok) throw new KioskRequestError(typeof data.error === 'string' ? data.error : 'Request failed. Please try again.', response.status, data.code)
    return data
  } finally { clearTimeout(timer) }
}
function currentLocation() {
  return new Promise<{ lat: number; lng: number; accuracy: number } | undefined>(resolve => {
    if (!navigator.geolocation) return resolve(undefined)
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(undefined), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 })
  })
}
export default function OfficeKioskPage() {
  const [company, setCompany] = useState(''), [code, setCode] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [result, setResult] = useState<{ name: string; message: string; recordedAt: string } | null>(null)
  const [time, setTime] = useState('')
  const [clock, setClock] = useState('')
  const [date, setDate] = useState('')
  const challengeWarmup = useRef<Promise<{ value: Awaited<ReturnType<typeof api>>; error?: never } | { error: unknown; value?: never }> | null>(null)
  const locationWarmup = useRef<{ startedAt: number; promise: ReturnType<typeof currentLocation> } | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)
  const [active, setActive] = useState(false)
  const [unrecognized, setUnrecognized] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const speak = useCallback((clip: string) => {
    const player = audio.current ?? new Audio()
    audio.current = player
    player.pause()
    player.src = `/audio/kiosk/${clip}.wav`
    void player.play().catch(() => {})
  }, [])
  const reset = useCallback(() => { setActive(false); setError(''); setResult(null); setUnrecognized(false); locationWarmup.current = null; challengeWarmup.current = null; audio.current?.pause() }, [])
  useEffect(() => () => { audio.current?.pause() }, [])
  useEffect(() => {
    if (!active || busy) return
    const timer = setTimeout(reset, result || error ? 10000 : 60000)
    return () => clearTimeout(timer)
  }, [active, busy, result, error, reset])
  // Prepare models on the idle screen without opening the camera. The scanner retries failures.
  useEffect(() => { if (company) void warmFaceApi().catch(() => {}) }, [company])
  useEffect(() => { void api('status').then(d => { setCompany(d.company); setLogo(d.logoUrl ?? null) }).catch(() => {}).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'medium' }))
      setClock(now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setDate(now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
    }
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer)
  }, [])
  async function pair() {
    setBusy(true); setError('')
    try { await api('pair', { code }); setCode(''); const data = await api('status'); setCompany(data.company); setLogo(data.logoUrl ?? null); setLogoFailed(false) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not pair device.') }
    finally { setBusy(false) }
  }
  const complete = useCallback(async (embeddings: number[][], photo: string | null) => {
    setBusy(true); setError(''); setResult(null); setUnrecognized(false)
    try {
      const warmup = locationWarmup.current
      const locationRequest = warmup && Date.now() - warmup.startedAt < 15000 ? warmup.promise : currentLocation()
      const challengeRequest = challengeWarmup.current
      const [prepared, location] = await Promise.all([challengeRequest ?? api('challenge', {}).then(value => ({ value, error: undefined })), locationRequest])
      if (prepared.error !== undefined) throw prepared.error
      const challenge = prepared.value
      const data = await api('clock', { challengeId: challenge.challengeId, model: FACE_MODEL_ID, embeddings, photo, ...location })
      setResult(data)
      const clips: Record<string, string> = { IN: 'in', OUT: 'out', BREAK_START: 'break-start', BREAK_END: 'break-end' }
      if (clips[data.action]) speak(clips[data.action])
    } catch (e) {
      if (e instanceof KioskRequestError) {
        setError(e.message)
        if (e.code === 'FACE_NOT_RECOGNIZED') { setUnrecognized(true); speak('unrecognized') }
        if (e.status === 401) setCompany('')
      } else setError('Connection lost. Ask HR to check your timesheet before scanning again.')
    } finally { setBusy(false) }
  }, [speak])
  if (!loading && company && !active) return <main className="kiosk-wallpaper kiosk-idle">
    <header className="kiosk-idle-brand">
      {logo && !logoFailed ? <img src={logo} alt={`${company} logo`} onError={() => setLogoFailed(true)} className="kiosk-idle-logo" /> : <ScanFace className="mx-auto h-16 w-16" aria-hidden="true" />}
      <h1>{company}</h1>
      <div className="kiosk-idle-clock" suppressHydrationWarning>{clock}</div>
      <p className="kiosk-idle-date" suppressHydrationWarning>{date}</p>
    </header>
    <button type="button" className="kiosk-touch-start" onClick={() => { setError(''); setResult(null); setUnrecognized(false); locationWarmup.current = { startedAt: Date.now(), promise: currentLocation() }; challengeWarmup.current = api('challenge', {}).then(value => ({ value }), error => ({ error })); setActive(true); speak('ready-steady') }}>
      <span className="kiosk-touch-symbol" aria-hidden="true"><span className="kiosk-touch-ring" /><span className="kiosk-touch-ring kiosk-touch-ring-delayed" /><Pointer /></span>
      <span>Touch to start</span>
    </button>
    <footer className="kiosk-idle-footer">Powered by <strong>OnClock</strong></footer>
  </main>
  if (company && active) return <main className="kiosk-wallpaper kiosk-active-screen">
    {!result && !error && <FaceMeshScanner fullScreen samples={3} sampleHoldMs={250} scanEffect capturePhoto accent="#ffffff" onComplete={complete} hint="One person at a time. Keep your face steady." />}
    {busy && <p role="status" className="kiosk-active-processing">Matching face and recording attendance...</p>}
    {(result || error) && <div className="kiosk-active-result">
      {result ? <div role="status"><h1>{result.message}</h1><p>{result.name}</p><p>{new Date(result.recordedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}</p><p>Attendance recorded. You may step away.</p></div>
        : <div role="alert"><h1>{unrecognized ? 'Face not recognized' : 'Attendance not confirmed'}</h1><p>{error}</p>{unrecognized && <p>Register your face in My Profile &rarr; Portal Access.</p>}</div>}
      <p className="text-sm mt-6">Returning to the start screen shortly.</p>
    </div>}
    <button type="button" className="kiosk-cancel-scan" disabled={busy} onClick={reset}>{busy ? 'Recording attendance...' : result || error ? 'Back to start' : 'Cancel scan'}</button>
  </main>
  return <main className="kiosk-wallpaper min-h-dvh px-4 py-6 flex items-center justify-center">
    <div className="w-full max-w-lg rounded-3xl bg-white/95 p-5 shadow-2xl space-y-4">
      <header className="text-center"><h1 className="text-xl font-bold">Office attendance kiosk</h1><p className="text-xs text-gray-500 mt-2" suppressHydrationWarning>{time}</p></header>
      {loading ? <p className="text-center">Checking device...</p> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void pair() }}>
        <p className="text-sm text-gray-600">Your company admin can generate a one-time pairing code in Attendance Settings after enabling face verification.</p>
        <label className="block text-sm font-medium">Pairing code<Input value={code} onChange={e => setCode(e.target.value)} maxLength={24} autoComplete="off" autoCapitalize="characters" className="mt-2" placeholder="XXXXXX-XXXXXX-XXXXXX" /></label>
        <Button className="w-full" disabled={busy || !code.trim()}>{busy ? 'Pairing...' : 'Pair office device'}</Button>
      </form>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  </main>
}

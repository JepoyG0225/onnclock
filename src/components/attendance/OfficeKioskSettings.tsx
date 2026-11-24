'use client'
import { useEffect, useState } from 'react'
import { AppSpinner } from '@/components/ui/AppSpinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Device = { active: boolean; name: string; pairedAt: string | null; lastSeenAt: string | null }
export function OfficeKioskSettings() {
  const [loading, setLoading] = useState(true)
  const [device, setDevice] = useState<Device | null>(null)
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'POST' | 'DELETE' | null>(null)
  const [downloading, setDownloading] = useState(false), [downloadError, setDownloadError] = useState('')
  async function download() {
    setDownloading(true); setDownloadError('')
    try {
      const response = await fetch('/api/office-kiosk/download', { cache: 'no-store' })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : 'Could not download the APK. Please try again.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = 'onclock-office-kiosk-1.0.1.apk'
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (e) { setDownloadError(e instanceof Error ? e.message : 'Could not download the APK. Please try again.') }
    finally { setDownloading(false) }
  }
  async function load() {
    setLoading(true)
    try {
    const response = await fetch('/api/office-kiosk/manage', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not load kiosk status.')
    setDevice(data.device)
    setError('')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load().catch(e => setError(e.message)) }, [])
  async function update(method: 'POST' | 'DELETE') {
    setBusy(true); setError(''); setConfirm(null)
    try {
      const response = await fetch('/api/office-kiosk/manage', { method })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update kiosk.')
      setCode(data.code || ''); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update kiosk.') }
    finally { setBusy(false) }
  }
  if (loading) return <div role="status" className="flex items-center justify-center gap-3 rounded-xl border p-6"><AppSpinner size="sm" /><span className="text-sm text-slate-500">Loading office kiosk settings...</span></div>
  if (error && !device) return <div role="alert" className="space-y-3 rounded-xl border p-4"><p className="text-sm text-red-700">{error}</p><Button variant="outline" onClick={() => { void load().catch(e => setError(e.message)) }}>Retry kiosk settings</Button></div>
  return <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
    <h2 className="font-semibold flex flex-wrap items-center gap-2">Office Android face kiosk <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800">Beta</Badge></h2>
    <p className="text-sm text-gray-600">Use one shared Android phone or tablet at the office. Employees register their face in their own employee app, then look at the kiosk camera to be identified and clocked in, started or ended on break, or clocked out automatically based on their attendance and schedule.</p>
    <ol className="list-decimal pl-5 text-sm space-y-1"><li>Save face verification as enabled.</li><li>Install the signed APK on the office device (Android 7 or newer).</li><li>Generate a pairing code here and enter it in the kiosk app within 15 minutes.</li><li>Allow camera and location access. Keep the device online and connected to power.</li></ol>
    <p className="text-xs text-gray-500">Schedule and geofence rules still apply. Desktop-only attendance remains required when screen monitoring is enforced. Scans are matched against active, enrolled employees in your company. Uncertain matches are rejected. Employees must step away after each result. The kiosk captures automatically without a blink challenge. Use it as an attended office terminal; it does not provide liveness or certified anti-spoofing verification.</p>
    <div className="flex flex-wrap gap-2 items-start">
      <div className="space-y-2">
        <Button type="button" disabled={downloading} onClick={() => void download()} aria-describedby={downloadError ? 'kiosk-download-error' : undefined}>{downloading ? 'Downloading…' : 'Download signed Android APK'}</Button>
        {downloadError && <p id="kiosk-download-error" role="alert" className="max-w-sm text-sm text-red-600">{downloadError}</p>}
      </div>
      <Button type="button" variant="outline" disabled={busy} onClick={() => device?.active ? setConfirm('POST') : void update('POST')}>{device?.active ? 'Replace paired device' : 'Generate pairing code'}</Button>
      {device?.active && <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm('DELETE')}>Revoke device</Button>}
    </div>
    <p className="text-sm">Status: {device?.active ? 'Paired' : 'Not paired'}{device?.lastSeenAt && ` · Last connected ${new Date(device.lastSeenAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`}</p>
    {code && <div className="rounded-lg border bg-white p-3"><p className="text-xs text-gray-500">One-time code · expires in 15 minutes · share only with the person setting up your office device</p><code className="block mt-2 font-bold text-lg tracking-wider break-all">{code.match(/.{1,6}/g)?.join('-')}</code></div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {confirm && <Dialog open onOpenChange={() => setConfirm(null)}><DialogContent><DialogHeader><DialogTitle>{confirm === 'POST' ? 'Replace office device?' : 'Revoke office device?'}</DialogTitle></DialogHeader><p className="text-sm">The currently paired device will immediately lose access. Employees can continue using their employee app.</p><div className="flex justify-center gap-2 mt-4"><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button onClick={() => void update(confirm)}>Confirm</Button></div></DialogContent></Dialog>}
  </section>
}

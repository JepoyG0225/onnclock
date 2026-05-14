'use client'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AppSpinner } from '@/components/ui/AppSpinner'
import {
  Fingerprint, Plus, RotateCcw, Trash2, ShieldOff, Wifi, WifiOff, Copy,
  ScanLine,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

type Status = 'PENDING_PAIRING' | 'ACTIVE' | 'DISABLED' | 'REVOKED'

interface Device {
  id: string
  name: string
  location: string | null
  serialNumber: string | null
  status: Status
  pairCode: string | null
  pairCodeExpiresAt: string | null
  pairedAt: string | null
  lastSeenAt: string | null
  firmwareVersion: string | null
  ipAddress: string | null
  createdAt: string
  _count: { events: number; enrollments: number }
}

const STATUS_BADGE: Record<Status, string> = {
  PENDING_PAIRING: 'bg-amber-100 text-amber-800',
  ACTIVE:          'bg-green-100 text-green-800',
  DISABLED:        'bg-gray-100 text-gray-600',
  REVOKED:         'bg-red-100 text-red-700',
}

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60_000
}

export default function BiometricDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', location: '' })
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/biometric-devices')
      const data = await res.json().catch(() => ({}))
      setDevices(data.devices ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function createDevice() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/biometric-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error ?? 'Failed to create device'); return }
      toast.success(`Pair code ${data.pairCode} — valid for 15 minutes`)
      setForm({ name: '', location: '' })
      setShowCreate(false)
      load()
    } finally {
      setCreating(false)
    }
  }

  async function regeneratePair(id: string) {
    const res = await fetch(`/api/biometric-devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REGENERATE_PAIR_CODE' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data?.error ?? 'Failed'); return }
    toast.success(`New pair code: ${data.pairCode}`)
    load()
  }

  async function revokeDevice(id: string) {
    if (!confirm('Revoke this device? Its bearer token will be cleared and it can no longer post clock events.')) return
    const res = await fetch(`/api/biometric-devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REVOKE' }),
    })
    if (res.ok) { toast.success('Device revoked'); load() }
    else { toast.error('Failed to revoke') }
  }

  async function deleteDevice(id: string) {
    if (!confirm('Delete this device permanently? This removes its pairing record and all event history.')) return
    const res = await fetch(`/api/biometric-devices/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Device deleted'); load() }
    else { toast.error('Failed to delete') }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast.success('Copied'))
  }

  const summary = useMemo(() => ({
    total:   devices.length,
    active:  devices.filter(d => d.status === 'ACTIVE').length,
    online:  devices.filter(d => d.status === 'ACTIVE' && isOnline(d.lastSeenAt)).length,
    pending: devices.filter(d => d.status === 'PENDING_PAIRING').length,
  }), [devices])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#2E4156' }}>Biometric Terminals</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage Raspberry-Pi-based fingerprint clock-in/out kiosks. Generate a 6-digit pair code, type it on the kiosk once, and the device is permanently bonded to your company.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} style={{ background: '#fa5e01' }}>
          <Plus className="w-4 h-4 mr-2" /> Add Device
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total devices</p><p className="text-2xl font-bold" style={{ color: '#2E4156' }}>{summary.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Active</p><p className="text-2xl font-bold text-green-700">{summary.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Online now</p><p className="text-2xl font-bold text-blue-700">{summary.online}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Awaiting pair</p><p className="text-2xl font-bold text-amber-700">{summary.pending}</p></CardContent></Card>
      </div>

      {showCreate && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-base">Add a new terminal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Device name *</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main lobby kiosk" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Location</label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Ground floor, beside reception" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createDevice} disabled={creating} style={{ background: '#fa5e01' }}>
                {creating ? 'Generating…' : 'Generate Pair Code'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
            <p className="text-[11px] text-gray-400">
              You&apos;ll receive a 6-digit code that is valid for 15 minutes. Boot the Pi, run the OnClock kiosk, and enter the code in the &ldquo;Pair this device&rdquo; screen.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Fingerprint className="w-4 h-4" />
            Devices
            <Badge variant="outline">{devices.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><AppSpinner size="md" /></div>
          ) : devices.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <ScanLine className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No biometric terminals yet — click <b>Add Device</b> to generate the first pair code.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="text-left p-3 font-medium">Device</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Last seen</th>
                    <th className="text-right p-3 font-medium">Enrollments</th>
                    <th className="text-right p-3 font-medium">Events</th>
                    <th className="text-left p-3 font-medium">Pair code</th>
                    <th className="text-center p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => {
                    const online = isOnline(d.lastSeenAt)
                    return (
                      <tr key={d.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium flex items-center gap-2">
                            {online
                              ? <Wifi className="w-3 h-3 text-green-600" />
                              : <WifiOff className="w-3 h-3 text-gray-300" />}
                            {d.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {d.location ?? '—'}
                            {d.serialNumber && ` · serial ${d.serialNumber}`}
                            {d.firmwareVersion && ` · fw ${d.firmwareVersion}`}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[d.status]}`}>
                            {d.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {d.lastSeenAt ? (
                            <>
                              <div>{formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true })}</div>
                              <div className="text-gray-400">{format(new Date(d.lastSeenAt), 'MMM d, HH:mm')}</div>
                            </>
                          ) : '—'}
                          {d.ipAddress && <div className="text-gray-400">IP {d.ipAddress}</div>}
                        </td>
                        <td className="p-3 text-right">{d._count.enrollments}</td>
                        <td className="p-3 text-right">{d._count.events}</td>
                        <td className="p-3">
                          {d.pairCode ? (
                            <div className="flex items-center gap-2">
                              <code className="text-base font-mono font-bold tracking-widest text-amber-700">{d.pairCode}</code>
                              <button onClick={() => copyCode(d.pairCode!)} title="Copy" className="text-gray-400 hover:text-gray-700">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                          {d.pairCodeExpiresAt && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              expires {formatDistanceToNow(new Date(d.pairCodeExpiresAt), { addSuffix: true })}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => regeneratePair(d.id)}>
                              <RotateCcw className="w-3 h-3 mr-1" /> New code
                            </Button>
                            {d.status === 'ACTIVE' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => revokeDevice(d.id)}>
                                <ShieldOff className="w-3 h-3 mr-1" /> Revoke
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => deleteDevice(d.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

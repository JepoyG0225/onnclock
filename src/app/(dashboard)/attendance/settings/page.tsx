'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { MapPin, Loader2, Fingerprint, Camera, ShieldCheck, Monitor } from 'lucide-react'
import { toast } from 'sonner'

export default function AttendanceSettingsPage() {
  const [saving, setSaving] = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [screenCaptureEntitled, setScreenCaptureEntitled] = useState(false)
  const [currentPricePerSeat, setCurrentPricePerSeat] = useState(0)
  const [form, setForm] = useState({
    fingerprintRequired: true,
    geofenceEnabled: false,
    selfieRequired: false,
    screenCaptureEnabled: false,
    screenCaptureFrequencyMinutes: '5',
    geofenceLat: '',
    geofenceLng: '',
    geofenceRadiusMeters: '',
  })

  async function load() {
    const [settingsRes, securityRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/attendance/security'),
    ])
    const data = await settingsRes.json().catch(() => ({}))
    const security = await securityRes.json().catch(() => ({}))
    const feature = security?.feature ?? {}
    setScreenCaptureEntitled(!!feature.entitled)
    setCurrentPricePerSeat(Number(feature.currentPricePerSeat ?? 0))

    setForm({
      fingerprintRequired: data.fingerprintRequired ?? true,
      geofenceEnabled: data.geofenceEnabled ?? false,
      selfieRequired: data.selfieRequired ?? false,
      screenCaptureEnabled: (data.screenCaptureEnabled ?? false) && !!feature.entitled,
      screenCaptureFrequencyMinutes: String(data.screenCaptureFrequencyMinutes ?? 5),
      geofenceLat: data.geofenceLat != null ? String(data.geofenceLat) : '',
      geofenceLng: data.geofenceLng != null ? String(data.geofenceLng) : '',
      geofenceRadiusMeters: data.geofenceRadiusMeters != null ? String(data.geofenceRadiusMeters) : '',
    })
  }

  useEffect(() => { void load() }, [])

  async function save() {
    setSaving(true)
    try {
      const payload = {
        fingerprintRequired: Boolean(form.fingerprintRequired),
        geofenceEnabled: Boolean(form.geofenceEnabled),
        selfieRequired: Boolean(form.selfieRequired),
        screenCaptureEnabled: Boolean(form.screenCaptureEnabled),
        screenCaptureFrequencyMinutes: Number(form.screenCaptureFrequencyMinutes || 5),
        geofenceLat: form.geofenceLat.trim() === '' ? null : Number(form.geofenceLat),
        geofenceLng: form.geofenceLng.trim() === '' ? null : Number(form.geofenceLng),
        geofenceRadiusMeters: form.geofenceRadiusMeters.trim() === '' ? null : Number(form.geofenceRadiusMeters),
      }

      if (payload.geofenceLat != null && !Number.isFinite(payload.geofenceLat)) payload.geofenceLat = null
      if (payload.geofenceLng != null && !Number.isFinite(payload.geofenceLng)) payload.geofenceLng = null
      if (payload.geofenceRadiusMeters != null && !Number.isFinite(payload.geofenceRadiusMeters)) payload.geofenceRadiusMeters = null
      if (!Number.isFinite(payload.screenCaptureFrequencyMinutes) || payload.screenCaptureFrequencyMinutes < 1) {
        payload.screenCaptureFrequencyMinutes = 5
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Failed to save attendance settings')
      toast.success('Attendance settings saved')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save attendance settings')
    } finally {
      setSaving(false)
    }
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported')
      return
    }

    setDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          geofenceLat: pos.coords.latitude.toFixed(7),
          geofenceLng: pos.coords.longitude.toFixed(7),
        }))
        setDetectingLocation(false)
        toast.success('Location detected. Set a radius and save.')
      },
      () => {
        setDetectingLocation(false)
        toast.error('Unable to detect location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure attendance security requirements for your company.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="relative flex flex-col gap-3 border rounded-xl p-4 bg-white cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.fingerprintRequired)}
                onChange={e => setForm(f => ({ ...f, fingerprintRequired: e.target.checked }))}
                className="absolute top-3 right-3"
              />
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <Fingerprint className="w-5 h-5" />
              </div>
              <span>
                <span className="text-sm font-medium text-gray-700 block">Require fingerprint</span>
                <span className="text-xs text-gray-500">Require biometric verification for clock in/out.</span>
              </span>
            </label>

            <label className="relative flex flex-col gap-3 border rounded-xl p-4 bg-white cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.geofenceEnabled)}
                onChange={e => setForm(f => ({ ...f, geofenceEnabled: e.target.checked }))}
                className="absolute top-3 right-3"
              />
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <span>
                <span className="text-sm font-medium text-gray-700 block">Enable geofencing</span>
                <span className="text-xs text-gray-500">Restrict clock in/out by office location radius.</span>
              </span>
            </label>

            <label className="relative flex flex-col gap-3 border rounded-xl p-4 bg-white cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.selfieRequired)}
                onChange={e => setForm(f => ({ ...f, selfieRequired: e.target.checked }))}
                className="absolute top-3 right-3"
              />
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <span>
                <span className="text-sm font-medium text-gray-700 block">Require selfie on clock in</span>
                <span className="text-xs text-gray-500">Employees must capture selfie before clocking in.</span>
              </span>
            </label>

            <label className={`relative flex flex-col gap-3 border rounded-xl p-4 bg-white ${screenCaptureEntitled ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={Boolean(form.screenCaptureEnabled)}
                onChange={e => setForm(f => ({ ...f, screenCaptureEnabled: e.target.checked }))}
                className="absolute top-3 right-3"
                disabled={!screenCaptureEntitled}
              />
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>
              <span>
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  Screen capture monitoring
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 tracking-wide">
                    PRO
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  Auto-captures desktop screenshots while clocked in and blocks mobile clock-in.
                </span>
              </span>
            </label>
          </div>

          {!screenCaptureEntitled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-700">Screen capture is locked</p>
              <p className="text-xs text-amber-700 mt-1">
                This feature requires the Php 70 per employee plan. Current plan rate: Php {currentPricePerSeat.toFixed(2)}.
              </p>
              <Link href="/settings/billing" className="text-xs font-semibold text-amber-800 underline mt-2 inline-block">
                Upgrade plan to unlock
              </Link>
            </div>
          )}

          {form.screenCaptureEnabled && (
            <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
              <div className="text-sm font-medium text-slate-700">Screen Capture Frequency</div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Capture every</label>
                <select
                  value={form.screenCaptureFrequencyMinutes}
                  onChange={e => setForm(f => ({ ...f, screenCaptureFrequencyMinutes: e.target.value }))}
                  className="w-full md:w-64 border rounded px-3 py-2 text-sm bg-white"
                >
                  <option value="1">1 minute</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">
                Employees will be prompted to share their screen from laptop/desktop while clocked in.
              </p>
            </div>
          )}

          {form.geofenceEnabled && (
            <div className="border rounded-xl p-4 space-y-4 bg-slate-50">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
                Geofence Location
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Latitude</label>
                  <Input
                    type="number"
                    value={form.geofenceLat}
                    onChange={e => setForm(f => ({ ...f, geofenceLat: e.target.value }))}
                    placeholder="14.5995"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Longitude</label>
                  <Input
                    type="number"
                    value={form.geofenceLng}
                    onChange={e => setForm(f => ({ ...f, geofenceLng: e.target.value }))}
                    placeholder="120.9842"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Radius (meters)</label>
                  <Input
                    type="number"
                    value={form.geofenceRadiusMeters}
                    onChange={e => setForm(f => ({ ...f, geofenceRadiusMeters: e.target.value }))}
                    placeholder="100"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={detectingLocation}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#AAB7B7] text-[#1A2D42] hover:bg-[#D4D8DD] transition-colors disabled:opacity-60"
                >
                  {detectingLocation
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Detecting...</>
                    : <><MapPin className="w-3 h-3" />Use Current Location</>}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Admins can disable these requirements for specific employees in Employee Profile {'>'} Employment.
          </p>

          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Attendance Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

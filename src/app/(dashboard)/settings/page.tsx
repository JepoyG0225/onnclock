'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building, Shield, Users, Lock, MapPin, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { PesoIcon } from '@/components/ui/PesoIcon'

interface Company {
  id: string; name: string; industry: string | null; address: string | null
  phone: string | null; email: string | null; website: string | null
  logoUrl: string | null
  portalUrl: string | null
  tinNo: string | null; sssNo: string | null; philhealthNo: string | null
  pagibigNo: string | null; birNo: string | null
  fingerprintRequired: boolean | null
  geofenceEnabled: boolean | null
  geofenceLat: number | null
  geofenceLng: number | null
  geofenceRadiusMeters: number | null
  contributionConfig: {
    sssEmployeeRate: number | null; sssEmployerRate: number | null
    philhealthRate: number | null; pagibigEmployeeRate: number | null
  } | null
}

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [copiedPortal, setCopiedPortal] = useState(false)
  const [form, setForm] = useState({
    name: '', industry: '', address: '', phone: '', email: '', website: '',
    logoUrl: '',
    tinNo: '', sssNo: '', philhealthNo: '', pagibigNo: '', birNo: '',
    fingerprintRequired: true,
    geofenceEnabled: false,
    geofenceLat: '',
    geofenceLng: '',
    geofenceRadiusMeters: '',
  })

  async function load() {
    const res = await fetch('/api/settings')
    const data = await res.json().catch(() => ({}))
    setCompany(data)
    setForm({
      name:         data.name ?? '',
      industry:     data.industry ?? '',
      address:      data.address ?? '',
      phone:        data.phone ?? '',
      email:        data.email ?? '',
      website:      data.website ?? '',
      logoUrl:      data.logoUrl ?? '',
      tinNo:        data.tinNo ?? '',
      sssNo:        data.sssNo ?? '',
      philhealthNo: data.philhealthNo ?? '',
      pagibigNo:    data.pagibigNo ?? '',
      birNo:        data.birNo ?? '',
      fingerprintRequired: data.fingerprintRequired ?? true,
      geofenceEnabled: data.geofenceEnabled ?? false,
      geofenceLat: data.geofenceLat != null ? String(data.geofenceLat) : '',
      geofenceLng: data.geofenceLng != null ? String(data.geofenceLng) : '',
      geofenceRadiusMeters: data.geofenceRadiusMeters != null ? String(data.geofenceRadiusMeters) : '',
    })
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const entries = Object.entries(form) as [string, unknown][]
      const payload = Object.fromEntries(
        entries.flatMap(([k, v]) => {
          if (k === 'geofenceEnabled' || k === 'fingerprintRequired') return [[k, Boolean(v)]]
          if (['geofenceLat', 'geofenceLng', 'geofenceRadiusMeters'].includes(k)) {
            const num = typeof v === 'string' && v.trim() !== '' ? Number(v) : null
            return [[k, Number.isFinite(num) ? num : null]]
          }
          if (typeof v === 'string' && v.trim() === '') {
            return k === 'name' ? [] : [[k, null]]
          }
          return [[k, v]]
        })
      )
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (Object.prototype.hasOwnProperty.call(data ?? {}, 'logoUrl')) {
          setForm(f => ({ ...f, logoUrl: data.logoUrl ?? '' }))
          window.dispatchEvent(
            new CustomEvent('company-logo-updated', { detail: { logoUrl: data.logoUrl ?? null } })
          )
        }
        await load()
        toast.success('Settings saved')
      } else {
        const msg = data?.error?.message || data?.error || 'Failed to save settings'
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const fields = (keys: (keyof typeof form)[], labels: Record<string, string>) =>
    keys.map(key => (
      <div key={key}>
        <label className="text-xs font-medium text-gray-600 block mb-1">{labels[key] ?? key}</label>
        <Input
          value={(form[key] ?? '') as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} 
          placeholder={labels[key]}
        />
      </div>
    ))

  const portalBaseDomain = process.env.NEXT_PUBLIC_PORTAL_BASE_DOMAIN || 'onclockph.com'
  const portalUrl = `https://${portalBaseDomain}/portal`

  async function copyPortalUrl() {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopiedPortal(true)
      toast.success('Portal URL copied')
      setTimeout(() => setCopiedPortal(false), 1500)
    } catch {
      toast.error('Failed to copy URL')
    }
  }

  async function detectLocation() {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return }
    setDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({
          ...f,
          geofenceLat: pos.coords.latitude.toFixed(7),
          geofenceLng: pos.coords.longitude.toFixed(7),
        }))
        setDetectingLocation(false)
        toast.success('Location detected — set a radius and save.')
      },
      () => { toast.error('Unable to detect location'); setDetectingLocation(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleLogoUpload(file: File) {
    const maxFileBytes = 1024 * 1024 // 1MB raw file size
    if (file.size > maxFileBytes) {
      toast.error('Logo file is too large (max 1MB).')
      return
    }

    const dataUrl = await resizeImageToDataUrl(file, 512)
    if (!dataUrl) {
      toast.error('Failed to process logo. Please try a different image.')
      return
    }

    const maxDataUrlChars = 1_500_000
    if (dataUrl.length > maxDataUrlChars) {
      toast.error('Logo is still too large after resize. Try a smaller image.')
      return
    }

    setForm(f => ({ ...f, logoUrl: dataUrl }))
  }

  async function resizeImageToDataUrl(file: File, maxSize: number): Promise<string | null> {
    const readAsDataUrl = () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })

    try {
      const src = await readAsDataUrl()
      const img = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Image load failed'))
      })
      img.src = src
      await loaded

      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const targetW = Math.max(1, Math.round(img.width * scale))
      const targetH = Math.max(1, Math.round(img.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, targetW, targetH)

      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Company profile and configuration</p>
      </div>

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building className="w-3.5 h-3.5" />Company
          </TabsTrigger>
          <TabsTrigger value="government" className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />Government IDs
          </TabsTrigger>
          <TabsTrigger value="users" asChild>
            <Link href="/settings/users" className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5" />User Management
            </Link>
          </TabsTrigger>
          <TabsTrigger value="permissions" asChild>
            <Link href="/settings/permissions" className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Lock className="w-3.5 h-3.5" />Role Permissions
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-2">Company Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                    {form.logoUrl
                      ? <img src={form.logoUrl} alt="Company logo" className="w-full h-full object-contain" />
                      : <span className="text-xs text-gray-400">No logo</span>
                    }
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) void handleLogoUpload(file)
                      }}
                    />
                    {form.logoUrl && (
                      <button
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() => setForm(f => ({ ...f, logoUrl: '' }))}
                      >
                        Remove logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields(['name', 'industry', 'address', 'phone', 'email', 'website'], {
                  name: 'Company Name *',
                  industry: 'Industry',
                  address: 'Business Address',
                  phone: 'Phone Number',
                  email: 'Company Email',
                  website: 'Website',
                })}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Employee Portal URL</label>
                <div className="flex items-center gap-2">
                  <Input value={portalUrl} readOnly />
                  <Button type="button" variant="outline" onClick={copyPortalUrl} className="gap-1.5">
                    {copiedPortal ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedPortal ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Share this with employees: they can sign in at this URL.
                </p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attendance Security</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-start gap-3 border rounded-lg p-3 bg-white cursor-pointer">
                    <input
                      id="fingerprintRequired"
                      type="checkbox"
                      checked={Boolean(form.fingerprintRequired)}
                      onChange={e => setForm(f => ({ ...f, fingerprintRequired: e.target.checked }))}
                      className="mt-1"
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-700 block">Require fingerprint</span>
                      <span className="text-xs text-gray-500">Require biometric verification for clock in/out.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 border rounded-lg p-3 bg-white cursor-pointer">
                    <input
                      id="geofenceEnabled"
                      type="checkbox"
                      checked={Boolean(form.geofenceEnabled)}
                      onChange={e => setForm(f => ({ ...f, geofenceEnabled: e.target.checked }))}
                      className="mt-1"
                    />
                    <span>
                      <span className="text-sm font-medium text-gray-700 block">Enable geo-fencing</span>
                      <span className="text-xs text-gray-500">Restrict clock in/out by office location radius.</span>
                    </span>
                  </label>
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
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors disabled:opacity-60"
                  >
                    {detectingLocation
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Detecting...</>
                      : <><MapPin className="w-3 h-3" />Use Current Location</>}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Employees can only clock in/out within the radius from the set location.
                </p>
              </div>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="government" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Government Registration Numbers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                These numbers are used in government report headers (SSS R3, PhilHealth RF-1, Pag-IBIG MCRF, BIR 1601C).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields(['tinNo', 'sssNo', 'philhealthNo', 'pagibigNo', 'birNo'], {
                  tinNo:        'BIR TIN (Employer)',
                  sssNo:        'SSS Employer ID',
                  philhealthNo: 'PhilHealth Employer No.',
                  pagibigNo:    'Pag-IBIG Employer MID',
                  birNo:        'BIR Certificate of Registration No.',
                })}
              </div>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Government IDs'}
              </Button>
            </CardContent>
          </Card>

          {/* Contribution Rate Reference */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PesoIcon className="w-4 h-4" />
                2024 Contribution Rates (Reference)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-teal-700">SSS 2024</p>
                  <div className="space-y-1 text-gray-600">
                    <p>Employee: 4.5% of MSC</p>
                    <p>Employer: 9.5% of MSC</p>
                    <p>EC: ₱10 (MSC &lt;₱14,750) / ₱30</p>
                    <p>MSC Range: ₱4,000 – ₱30,000</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-green-700">PhilHealth 2024</p>
                  <div className="space-y-1 text-gray-600">
                    <p>Rate: 5% of basic salary</p>
                    <p>Employee: 2.5%</p>
                    <p>Employer: 2.5%</p>
                    <p>Salary Ceiling: ₱100,000</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-yellow-700">Pag-IBIG 2024</p>
                  <div className="space-y-1 text-gray-600">
                    <p>Employee: 1% (≤₱1,500) / 2%</p>
                    <p>Employer: 2% always</p>
                    <p>Max EE/ER: ₱100/month</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

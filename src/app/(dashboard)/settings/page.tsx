'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building, Shield, Users, Lock, Copy, Check, HardDrive, FileText, Briefcase, ArrowUpRight, Loader2, Sparkles, AlertTriangle, PackagePlus, CheckCircle2, X, Mail } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { PesoIcon } from '@/components/ui/PesoIcon'

export default function SettingsPage() {
  const [saving,  setSaving]  = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [copiedPortal, setCopiedPortal] = useState(false)
  const [form, setForm] = useState({
    name: '', industry: '', address: '', phone: '', email: '', website: '',
    logoUrl: '',
    tinNo: '', sssNo: '', philhealthNo: '', pagibigNo: '', birNo: '',
  })
  const [smtp, setSmtp] = useState({
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    smtpFromEmail: '',
    smtpFromName: '',
    hasSmtpPass: false,
  })

  async function load() {
    const res = await fetch('/api/settings')
    const data = await res.json().catch(() => ({}))
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
    })
  }

  useEffect(() => { void load() }, [])

  async function loadEmailSettings() {
    try {
      const res = await fetch('/api/recruitment/email-settings')
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.smtp) return
      setSmtp({
        smtpHost: data.smtp.smtpHost ?? '',
        smtpPort: Number(data.smtp.smtpPort ?? 465),
        smtpSecure: Boolean(data.smtp.smtpSecure ?? true),
        smtpUser: data.smtp.smtpUser ?? '',
        smtpPass: '',
        smtpFromEmail: data.smtp.smtpFromEmail ?? '',
        smtpFromName: data.smtp.smtpFromName ?? '',
        hasSmtpPass: Boolean(data.smtp.hasSmtpPass),
      })
    } catch {
      // silent
    }
  }

  useEffect(() => { void loadEmailSettings() }, [])

  async function save() {
    setSaving(true)
    try {
      const entries = Object.entries(form) as [string, unknown][]
      const payload = Object.fromEntries(
        entries.flatMap(([k, v]) => {
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
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" />Email
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
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5" />Storage
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
                  <p className="font-semibold text-[#1A2D42]">SSS 2024</p>
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

        <TabsContent value="email" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SMTP Email Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Configure SMTP credentials to send emails using your company email account.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">SMTP Host</label>
                  <Input value={smtp.smtpHost} onChange={e => setSmtp(prev => ({ ...prev, smtpHost: e.target.value }))} placeholder="smtp.yourdomain.com" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">SMTP Port</label>
                  <Input type="number" value={smtp.smtpPort} onChange={e => setSmtp(prev => ({ ...prev, smtpPort: Number(e.target.value || 465) }))} placeholder="465" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">SMTP Username</label>
                  <Input value={smtp.smtpUser} onChange={e => setSmtp(prev => ({ ...prev, smtpUser: e.target.value }))} placeholder="hr@yourcompany.com" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">SMTP Password</label>
                  <Input type="password" value={smtp.smtpPass} onChange={e => setSmtp(prev => ({ ...prev, smtpPass: e.target.value }))} placeholder={smtp.hasSmtpPass ? 'Leave blank to keep current password' : 'Enter SMTP password'} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">From Name</label>
                  <Input value={smtp.smtpFromName} onChange={e => setSmtp(prev => ({ ...prev, smtpFromName: e.target.value }))} placeholder="Company HR Team" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">From Email</label>
                  <Input type="email" value={smtp.smtpFromEmail} onChange={e => setSmtp(prev => ({ ...prev, smtpFromEmail: e.target.value }))} placeholder="hr@yourcompany.com" />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={smtp.smtpSecure} onChange={e => setSmtp(prev => ({ ...prev, smtpSecure: e.target.checked }))} />
                Use secure connection (SSL/TLS)
              </label>
              <Button
                onClick={async () => {
                  setSavingEmail(true)
                  try {
                    const payload: Record<string, unknown> = {
                      smtpHost: smtp.smtpHost || null,
                      smtpPort: Number(smtp.smtpPort || 465),
                      smtpSecure: smtp.smtpSecure,
                      smtpUser: smtp.smtpUser || null,
                      smtpFromEmail: smtp.smtpFromEmail || null,
                      smtpFromName: smtp.smtpFromName || null,
                    }
                    if (smtp.smtpPass.trim()) payload.smtpPass = smtp.smtpPass
                    const res = await fetch('/api/recruitment/email-settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(data?.error || 'Failed to save SMTP settings')
                    setSmtp(prev => ({ ...prev, smtpPass: '', hasSmtpPass: Boolean(prev.smtpPass || prev.hasSmtpPass) }))
                    toast.success('SMTP settings saved')
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed to save SMTP settings')
                  } finally {
                    setSavingEmail(false)
                  }
                }}
                disabled={savingEmail}
              >
                {savingEmail ? 'Saving...' : 'Save SMTP Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <StorageTab />
        </TabsContent>

      </Tabs>
    </div>
  )
}

// ─── Storage Tab ──────────────────────────────────────────────────────────────

type AddOnTier = { gb: number; label: string; monthlyPrice: number; priceLabel: string }

type StorageData = {
  usedBytes: number
  usedLabel: string
  docsBytes: number
  docsLabel: string
  resumesBytes: number
  resumesLabel: string
  usedPct: number
  planName: string
  baseLimitLabel: string
  limitBytes: number
  limitLabel: string
  pricePerSeat: number
  isTopTier: boolean
  upgradePricePerSeat: number | null
  addOnGb: number
  addOnPrice: number
  addOnLabel: string | null
  addOnTiers: AddOnTier[]
  employeeCount: number
  upgradeMonthlyEstimate: number | null
  currentMonthlyBase: number
  nextMonthlyTotal: number
}

const BASE_PLANS = [
  { name: 'Trial',  price: 'Free',          storage: '200 MB', storageBytes: 200 * 1024 * 1024,         barPct: 2,   description: '7-day free trial'        },
  { name: 'Basic',  price: '₱50/employee',  storage: '5 GB',   storageBytes: 5 * 1024 * 1024 * 1024,    barPct: 50,  description: 'Core HR & payroll'       },
  { name: 'Pro',    price: '₱70/employee',  storage: '20 GB',  storageBytes: 20 * 1024 * 1024 * 1024,   barPct: 100, description: 'Full HR suite + security' },
] as const

function StorageTab() {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingAddOn, setSavingAddOn] = useState(false)
  const [pendingAddOn, setPendingAddOn] = useState<number | null>(null)

  function reload() {
    setLoading(true)
    fetch('/api/settings/storage')
      .then((r) => r.json())
      .then((d) => { setData(d); setPendingAddOn(null) })
      .catch(() => toast.error('Failed to load storage info'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  async function saveAddOn(gb: number) {
    setSavingAddOn(true)
    try {
      const res = await fetch('/api/settings/storage/addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addOnGb: gb }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(json.message ?? 'Storage add-on updated')
        reload()
      } else {
        toast.error(json.error ?? 'Failed to update storage add-on')
      }
    } finally {
      setSavingAddOn(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-500">
          Could not load storage information.
        </CardContent>
      </Card>
    )
  }

  const barColor =
    data.usedPct >= 90 ? 'bg-red-500' :
    data.usedPct >= 70 ? 'bg-amber-500' :
    'bg-[#1A2D42]'
  const barBg =
    data.usedPct >= 90 ? 'bg-red-100' :
    data.usedPct >= 70 ? 'bg-amber-100' : 'bg-slate-100'

  const perEmpBytes = data.employeeCount > 0 ? Math.floor(data.limitBytes / data.employeeCount) : 0
  const perEmpLabel = perEmpBytes >= 1024 * 1024 * 1024
    ? `${(perEmpBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.round(perEmpBytes / (1024 * 1024))} MB`

  const selectedAddOn = pendingAddOn !== null ? pendingAddOn : data.addOnGb

  return (
    <div className="space-y-4">

      {/* ── Current usage ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-600" />
            Document Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Plan + add-on badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              data.planName === 'Pro' ? 'bg-emerald-100 text-emerald-700' :
              data.planName === 'Basic' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {data.planName === 'Pro' && <Sparkles className="w-3 h-3" />}
              {data.planName} Plan · {data.baseLimitLabel}
            </span>
            {data.addOnLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                <PackagePlus className="w-3 h-3" /> {data.addOnLabel} add-on
              </span>
            )}
            <span className="text-sm font-semibold text-slate-700">{data.limitLabel} total</span>
            {data.employeeCount > 0 && (
              <span className="text-xs text-slate-400">(~{perEmpLabel}/employee)</span>
            )}
          </div>

          {/* Usage bar */}
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-2xl font-black text-slate-900">{data.usedLabel}</span>
              <span className="text-sm text-slate-500">of {data.limitLabel}</span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${barBg}`}>
              <div className={`h-3 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${data.usedPct}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${data.usedPct >= 90 ? 'text-red-600' : data.usedPct >= 70 ? 'text-amber-600' : 'text-slate-500'}`}>
                {data.usedPct}% used
              </span>
              <span className="text-xs text-slate-400">
                {data.usedPct < 100 ? (data.usedPct < 90 ? 'Available' : '⚠ Almost full') : '🚫 Storage full'}
              </span>
            </div>
            {data.usedPct >= 90 && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 font-medium">
                  Storage is nearly full. Upgrade your plan or add storage to keep uploading documents.
                </p>
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Breakdown</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">Employee Documents</p>
                  <p className="text-sm font-black text-slate-900">{data.docsLabel}</p>
                </div>
                {data.usedBytes > 0 && (
                  <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                    {Math.round((data.docsBytes / data.usedBytes) * 100)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">Recruitment Resumes</p>
                  <p className="text-sm font-black text-slate-900">{data.resumesLabel}</p>
                </div>
                {data.usedBytes > 0 && (
                  <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                    {Math.round((data.resumesBytes / data.usedBytes) * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Base plan comparison ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-600" />
            Storage Allotment by Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {BASE_PLANS.map((tier) => {
              const isCurrent = tier.name === data.planName
              const perEmp = data.employeeCount > 0 ? Math.floor(tier.storageBytes / data.employeeCount) : null
              const perEmpStr = perEmp === null ? null
                : perEmp >= 1024 * 1024 * 1024
                  ? `${(perEmp / (1024 * 1024 * 1024)).toFixed(1)} GB`
                  : `${Math.round(perEmp / (1024 * 1024))} MB`

              return (
                <div key={tier.name} className={`relative rounded-xl border-2 p-4 transition-all ${
                  isCurrent
                    ? tier.name === 'Pro' ? 'border-emerald-400 bg-emerald-50'
                    : tier.name === 'Basic' ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-300 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}>
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded text-[10px] font-bold bg-[#1A2D42] text-white">Current</span>
                  )}
                  {tier.name === 'Pro' && !isCurrent && (
                    <span className="absolute -top-2.5 right-3 inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white">
                      <Sparkles className="w-2.5 h-2.5" /> Best
                    </span>
                  )}
                  <div className="space-y-3">
                    <div>
                      <p className={`text-sm font-bold ${isCurrent && tier.name === 'Pro' ? 'text-emerald-800' : isCurrent && tier.name === 'Basic' ? 'text-blue-800' : 'text-slate-800'}`}>
                        {tier.name}
                      </p>
                      <p className="text-xs text-slate-500">{tier.description}</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-black ${tier.name === 'Pro' ? 'text-emerald-700' : tier.name === 'Basic' ? 'text-blue-700' : 'text-slate-600'}`}>
                        {tier.storage}
                      </p>
                      {perEmpStr && <p className="text-[11px] text-slate-500 mt-0.5">~{perEmpStr}/employee</p>}
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${tier.name === 'Pro' ? 'bg-emerald-500' : tier.name === 'Basic' ? 'bg-blue-500' : 'bg-slate-400'}`}
                        style={{ width: `${tier.barPct}%` }} />
                    </div>
                    <p className={`text-xs font-semibold ${tier.name === 'Pro' ? 'text-emerald-700' : tier.name === 'Basic' ? 'text-blue-700' : 'text-slate-500'}`}>
                      {tier.price}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Upgrade to Pro CTA */}
          {!data.isTopTier && (
            <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm font-bold text-emerald-900">
                      Upgrade to Pro at ₱70/employee — unlock 20 GB
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700">
                    <span>• <strong>20 GB</strong> base storage (vs {data.baseLimitLabel} now)</span>
                    <span>• Recruitment, onboarding & performance tools</span>
                    <span>• Screen-capture security</span>
                  </div>
                  {data.upgradeMonthlyEstimate !== null && data.employeeCount > 0 && (
                    <p className="text-xs text-emerald-800 font-semibold bg-emerald-100 inline-block px-2.5 py-1 rounded-full">
                      Est. ₱{data.upgradeMonthlyEstimate.toLocaleString('en-PH')}/month for {data.employeeCount} employees
                    </p>
                  )}
                </div>
                <Link href="/settings/billing"
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors whitespace-nowrap shadow-sm">
                  Upgrade <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {data.isTopTier && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">You&apos;re on the Pro plan</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  20 GB base storage included.{data.employeeCount > 0 && ` ~${Math.round((20 * 1024) / data.employeeCount)} MB per employee.`}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Storage Add-On ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-violet-600" />
            Storage Add-On
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Need more space? Add extra storage on top of your current plan.
            Changes apply to your <strong>next billing cycle</strong>.
          </p>

          {/* Current add-on status */}
          {data.addOnGb > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-800">
                  Active add-on: +{data.addOnGb} GB at ₱{data.addOnPrice.toLocaleString('en-PH')}/month
                </p>
                <p className="text-xs text-violet-600">Total storage: {data.limitLabel}</p>
              </div>
              <button
                onClick={() => { setPendingAddOn(0); saveAddOn(0) }}
                disabled={savingAddOn}
                className="text-xs text-violet-500 hover:text-red-600 transition-colors disabled:opacity-50 flex items-center gap-0.5 shrink-0"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          )}

          {/* Add-on tier cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.addOnTiers.map((tier) => {
              const isActive = data.addOnGb === tier.gb
              const isSelected = selectedAddOn === tier.gb

              return (
                <button
                  key={tier.gb}
                  onClick={() => setPendingAddOn(tier.gb)}
                  disabled={savingAddOn}
                  className={`relative text-left rounded-xl border-2 p-4 transition-all disabled:opacity-60 ${
                    isActive
                      ? 'border-violet-400 bg-violet-50'
                      : isSelected
                        ? 'border-violet-300 bg-violet-50/50'
                        : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30'
                  }`}
                >
                  {isActive && (
                    <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600 text-white">
                      Active
                    </span>
                  )}
                  <div className="space-y-2">
                    <p className="text-xl font-black text-slate-800">{tier.label}</p>
                    <p className="text-sm font-bold text-violet-700">{tier.priceLabel}</p>
                    <p className="text-[11px] text-slate-500">
                      Flat monthly fee · any plan
                    </p>
                    {data.addOnGb !== tier.gb && isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600">
                        <Check className="w-3 h-3" /> Selected
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Confirm / next-bill preview */}
          {pendingAddOn !== null && pendingAddOn !== data.addOnGb && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <PackagePlus className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-violet-800">
                    {pendingAddOn === 0
                      ? 'Remove storage add-on'
                      : `Add +${pendingAddOn} GB storage`}
                  </p>
                  <div className="text-xs text-violet-700 space-y-0.5 mt-1">
                    {pendingAddOn > 0 && (() => {
                      const tier = data.addOnTiers.find(t => t.gb === pendingAddOn)
                      const newTotal = data.currentMonthlyBase + (tier?.monthlyPrice ?? 0)
                      return (
                        <>
                          <p>Add-on cost: <strong>₱{(tier?.monthlyPrice ?? 0).toLocaleString('en-PH')}/month</strong></p>
                          <p>New estimated monthly total: <strong>₱{newTotal.toLocaleString('en-PH')}</strong>
                            {data.employeeCount > 0 && ` (${data.employeeCount} employees × ₱${data.pricePerSeat} + add-on)`}
                          </p>
                        </>
                      )
                    })()}
                    <p className="text-violet-500 italic">Takes effect on your next billing cycle.</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => saveAddOn(pendingAddOn)}
                  disabled={savingAddOn}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {savingAddOn ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingAddOn(null)}
                  disabled={savingAddOn}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Current next-bill summary */}
          {data.nextMonthlyTotal > 0 && data.addOnGb > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Next billing estimate</p>
              <p>Plan: {data.employeeCount} employees × ₱{data.pricePerSeat} = ₱{data.currentMonthlyBase.toLocaleString('en-PH')}</p>
              <p>Storage add-on (+{data.addOnGb} GB): ₱{data.addOnPrice.toLocaleString('en-PH')}</p>
              <p className="font-bold text-slate-800 pt-0.5 border-t border-slate-200">
                Total: ₱{data.nextMonthlyTotal.toLocaleString('en-PH')}/month
              </p>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Storage counts all employee 201 documents and recruitment resume files.
            Company logos, career banners, and onboarding proofs use separate cloud storage and are not counted here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, ExternalLink, Facebook, Globe, ImageIcon, Instagram, Linkedin, Save, Twitter, X } from 'lucide-react'
import { toast } from 'sonner'
import { parseCareerHeroContent, serializeCareerHeroContent } from '@/lib/career-page'

interface CareerSettings {
  id: string
  name: string
  logoUrl: string | null
  careerBannerUrl: string | null
  careerTagline: string | null
  careerDescription: string | null
  careerSocialFacebook: string | null
  careerSocialLinkedin: string | null
  careerSocialTwitter: string | null
  careerSocialInstagram: string | null
  website: string | null
}

export default function RecruitmentSettingsPage() {
  const [settings, setSettings] = useState<CareerSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    careerBannerUrl: null as string | null,
    careerTagline: '',
    careerDescription: '',
    careerCtaLabel: 'View open positions',
    careerCtaUrl: '#open-positions',
    careerSocialFacebook: '',
    careerSocialLinkedin: '',
    careerSocialTwitter: '',
    careerSocialInstagram: '',
  })
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        const hero = parseCareerHeroContent(data.careerDescription)
        setForm({
          careerBannerUrl: data.careerBannerUrl ?? null,
          careerTagline: data.careerTagline ?? '',
          careerDescription: hero.subtext,
          careerCtaLabel: hero.ctaLabel,
          careerCtaUrl: hero.ctaUrl,
          careerSocialFacebook: data.careerSocialFacebook ?? '',
          careerSocialLinkedin: data.careerSocialLinkedin ?? '',
          careerSocialTwitter: data.careerSocialTwitter ?? '',
          careerSocialInstagram: data.careerSocialInstagram ?? '',
        })
      })
      .catch(() => toast.error('Failed to load settings'))
  }, [])

  function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Banner image must be under 4MB')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      setForm(p => ({ ...p, careerBannerUrl: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          careerBannerUrl: form.careerBannerUrl,
          careerTagline: form.careerTagline || null,
          careerDescription: serializeCareerHeroContent({ subtext: form.careerDescription, ctaLabel: form.careerCtaLabel, ctaUrl: form.careerCtaUrl }),
          careerSocialFacebook: form.careerSocialFacebook || null,
          careerSocialLinkedin: form.careerSocialLinkedin || null,
          careerSocialTwitter: form.careerSocialTwitter || null,
          careerSocialInstagram: form.careerSocialInstagram || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      toast.success('Career page saved')
      setSettings(s => s ? { ...s, ...data } : s)
      // Sync form with stored URLs returned from server (base64 → storage URL)
      setForm(p => ({
        ...p,
        careerBannerUrl: data.careerBannerUrl ?? p.careerBannerUrl,
        careerTagline: data.careerTagline ?? p.careerTagline,
        careerDescription: parseCareerHeroContent(data.careerDescription).subtext,
        careerCtaLabel: parseCareerHeroContent(data.careerDescription).ctaLabel,
        careerCtaUrl: parseCareerHeroContent(data.careerDescription).ctaUrl,
        careerSocialFacebook: data.careerSocialFacebook ?? p.careerSocialFacebook,
        careerSocialLinkedin: data.careerSocialLinkedin ?? p.careerSocialLinkedin,
        careerSocialTwitter: data.careerSocialTwitter ?? p.careerSocialTwitter,
        careerSocialInstagram: data.careerSocialInstagram ?? p.careerSocialInstagram,
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><Link href="/recruitment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3 font-medium">
          <ArrowLeft className="w-3 h-3" /> Back to Recruitment
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Career Page Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Build a branded landing page that introduces your company and guides candidates to open roles.</p></div>
        {settings?.id && <Link href={`/careers/${settings.id}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-[#1d4ed8] hover:bg-blue-100"><ExternalLink className="h-4 w-4" /> View Live Career Page</Link>}
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-[#071d3b] shadow-sm">
        <div className="relative min-h-[360px]">
          {form.careerBannerUrl && <img src={form.careerBannerUrl} alt="Career page hero preview" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,29,59,0.82)_0%,rgba(7,91,212,0.58)_48%,rgba(11,111,251,0.34)_100%)]" />
          <div className="relative z-10 flex min-h-[360px] max-w-2xl flex-col justify-center px-8 py-12 sm:px-12">
            <span className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-white">Careers at {settings?.name ?? 'Your company'}</span>
            <h2 className="text-3xl font-black leading-tight text-white sm:text-5xl">{form.careerTagline || 'Do your best work with us.'}</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-blue-50 sm:text-base">{form.careerDescription || 'Tell candidates what makes your company, culture, and mission worth joining.'}</p>
            <span className="mt-7 inline-flex w-fit rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#075bd4] shadow-sm">{form.careerCtaLabel || 'View open positions'}</span>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-500">Live hero preview · Changes appear here as you type</div>
      </section>

      {/* Hero copy */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Hero Content</h2>

        <div>
          <div className="mb-2 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-slate-600">Hero image</p><p className="mt-1 text-xs text-slate-400">Recommended: 1600 &times; 900px · JPG, PNG or WebP · Max 4MB</p></div>{form.careerBannerUrl && <button type="button" onClick={() => bannerInputRef.current?.click()} className="shrink-0 text-xs font-bold text-blue-600 hover:text-blue-700">Replace image</button>}</div>
          <div className="relative h-44 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {form.careerBannerUrl ? <><img src={form.careerBannerUrl} alt="Career banner" className="h-full w-full object-cover" /><button type="button" onClick={() => { setForm(p => ({ ...p, careerBannerUrl: null })); if (bannerInputRef.current) bannerInputRef.current.value = '' }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/60 text-white hover:bg-slate-950/80" aria-label="Remove hero image"><X className="h-4 w-4" /></button></> : <button type="button" onClick={() => bannerInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 transition hover:bg-slate-50 hover:text-blue-600"><ImageIcon className="h-8 w-8" /><span className="text-sm font-semibold">Upload hero image</span></button>}
          </div>
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBannerFile} className="sr-only" />
        </div>

        {/* Preview of logo + name */}
        {settings && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={settings.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{settings.name}</p>
              <p className="text-xs text-slate-500">Logo & company name come from Company Settings</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hero headline <span className="text-slate-400 font-normal">(max 200 chars)</span></label>
          <input
            value={form.careerTagline}
            onChange={e => setForm(p => ({ ...p, careerTagline: e.target.value }))}
            maxLength={200}
            placeholder="e.g. Build the future with us"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{form.careerTagline.length}/200</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hero supporting text</label>
          <textarea
            value={form.careerDescription}
            onChange={e => setForm(p => ({ ...p, careerDescription: e.target.value }))}
            maxLength={1500}
            rows={5}
            placeholder="Give candidates a short, compelling reason to explore your open roles..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{form.careerDescription.length}/1500</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">CTA button label</label><input value={form.careerCtaLabel} onChange={e => setForm(p => ({ ...p, careerCtaLabel: e.target.value }))} maxLength={50} placeholder="View open positions" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">CTA destination</label><input value={form.careerCtaUrl} onChange={e => setForm(p => ({ ...p, careerCtaUrl: e.target.value }))} maxLength={300} placeholder="#open-positions or https://..." className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" /></div>
        </div>
      </div>

      {/* Social links */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Social Media &amp; Website</h2>
        <p className="text-xs text-slate-500">Links will appear on your public job postings so applicants can learn more about you.</p>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Linkedin className="w-4 h-4 text-blue-700" />
            </div>
            <input
              value={form.careerSocialLinkedin}
              onChange={e => setForm(p => ({ ...p, careerSocialLinkedin: e.target.value }))}
              placeholder="https://linkedin.com/company/your-company"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Facebook className="w-4 h-4 text-blue-600" />
            </div>
            <input
              value={form.careerSocialFacebook}
              onChange={e => setForm(p => ({ ...p, careerSocialFacebook: e.target.value }))}
              placeholder="https://facebook.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <Twitter className="w-4 h-4 text-sky-500" />
            </div>
            <input
              value={form.careerSocialTwitter}
              onChange={e => setForm(p => ({ ...p, careerSocialTwitter: e.target.value }))}
              placeholder="https://twitter.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center shrink-0">
              <Instagram className="w-4 h-4 text-pink-600" />
            </div>
            <input
              value={form.careerSocialInstagram}
              onChange={e => setForm(p => ({ ...p, careerSocialInstagram: e.target.value }))}
              placeholder="https://instagram.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          {settings?.website && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-sm text-slate-500 flex-1">
                Website: <a href={settings.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{settings.website}</a>
                <span className="ml-1 text-xs text-slate-400">(edit in Company Settings)</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Career Page'}
        </button>
      </div>
    </div>
  )
}

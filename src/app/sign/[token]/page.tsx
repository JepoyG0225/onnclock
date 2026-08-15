'use client'

import { use, useEffect, useRef, useState } from 'react'
import { Building2, CheckCircle2, FileSignature, Loader2, ShieldCheck } from 'lucide-react'
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/SignaturePad'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Signatory = { id: string; role: 'CANDIDATE' | 'COMPANY'; name: string; title: string; email: string; required: boolean }
type SigningData = {
  document: { title: string; type: string; content: string; richText: boolean; paperSize: 'A4' | 'LETTER' | 'LEGAL'; status: string; signatories: Signatory[]; signedAt: string | null; expiresAt: string | null; expired: boolean }
  candidate: { name: string; emailHint: string }
  company: { name: string; tradeName: string | null; logoUrl: string | null }
  job: { title: string; department: string | null; location: string | null }
}

export default function CandidateSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const pad = useRef<SignaturePadHandle>(null)
  const [data, setData] = useState<SigningData | null>(null)
  const [error, setError] = useState('')
  const [typedName, setTypedName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)

  useEffect(() => { fetch(`/api/public/sign/${token}`).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body) }).catch(err => setError(err.message)) }, [token])

  async function sign() {
    const signatureDataUrl = pad.current?.toDataURL()
    if (!signatureDataUrl) return setError('Please draw your signature before submitting.')
    setSubmitting(true); setError('')
    try {
      const response = await fetch(`/api/public/sign/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typedName, email, signatureDataUrl, consent }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      setComplete(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign this document.') } finally { setSubmitting(false) }
  }

  if (error && !data) return <Message title="Unable to open document" body={error} />
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><AppSpinner size="lg" message="Loading document…" /></div>
  if (complete || data.document.status === 'SIGNED') return <Message success title="Document signed" body="Your signature has been recorded securely. You may now close this page." />

  const unavailable = data.document.status !== 'SENT' || data.document.expired
  return <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-4xl">
      <header className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">{data.company.logoUrl ? <img src={data.company.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="h-5 w-5" /></span>}<div><p className="font-bold text-slate-900">{data.company.tradeName || data.company.name}</p><p className="text-xs text-slate-500">Secure document signing</p></div></div>
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
      </header>
      <article className="mx-auto rounded-sm border border-slate-200 bg-white shadow-lg" style={{ maxWidth: data.document.paperSize === 'A4' ? 794 : 816, minHeight: data.document.paperSize === 'LEGAL' ? 1344 : data.document.paperSize === 'A4' ? 1123 : 1056 }}>
        <div className="border-b border-slate-100 px-6 py-6 sm:px-10"><span className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><FileSignature className="h-3.5 w-3.5" />{data.document.type.replaceAll('_', ' ')}</span><h1 className="text-2xl font-black text-slate-950">{data.document.title}</h1><p className="mt-2 text-sm text-slate-500">Prepared for {data.candidate.name} · {data.job.title}</p></div>
        {data.document.richText ? <div className="px-6 py-8 text-sm leading-7 text-slate-700 sm:px-10" dangerouslySetInnerHTML={{ __html: data.document.content }} /> : <div className="whitespace-pre-wrap px-6 py-8 text-sm leading-7 text-slate-700 sm:px-10">{data.document.content}</div>}
        <div className="grid gap-8 border-t border-slate-100 px-6 py-8 sm:grid-cols-2 sm:px-10">{data.document.signatories.map(signatory => <div key={signatory.id} className="pt-10"><div className="border-t border-slate-400 pt-2"><p className="text-sm font-bold text-slate-900">{signatory.name || (signatory.role === 'CANDIDATE' ? data.candidate.name : 'Company signatory')}</p><p className="text-xs text-slate-500">{signatory.title || signatory.role.toLowerCase()}</p></div></div>)}</div>
      </article>
      {unavailable ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">{data.document.expired ? 'This signing link has expired.' : 'This document is not currently available for signing.'}</div> :
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-lg font-black text-slate-950">Accept and sign</h2><p className="mt-1 text-sm text-slate-500">Verify your email, type your legal name, then draw your signature.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Email address <span className="font-normal text-slate-400">({data.candidate.emailHint})</span><input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label><label className="text-sm font-semibold text-slate-700">Full legal name<input value={typedName} onChange={e => setTypedName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500" /></label></div>
        <div className="mt-5"><p className="mb-2 text-sm font-semibold text-slate-700">Draw signature</p><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2"><SignaturePad ref={pad} width={720} height={180} /></div></div>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-600"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I have reviewed this document and agree that my electronic signature has the same intent as a handwritten signature.</span></label>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <button type="button" onClick={sign} disabled={submitting || !consent || typedName.trim().length < 2} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}Sign document</button>
      </section>}
    </div>
  </main>
}

function Message({ title, body, success = false }: { title: string; body: string; success?: boolean }) { return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">{success ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" /> : <FileSignature className="mx-auto h-12 w-12 text-slate-300" />}<h1 className="mt-4 text-xl font-black text-slate-950">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></div></main> }

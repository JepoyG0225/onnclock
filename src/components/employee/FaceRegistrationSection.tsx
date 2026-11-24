'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'


import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'
import { ScanFace, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FaceEnrollDialog } from './FaceEnrollDialog'

export function FaceRegistrationSection() {
  const [status, setStatus] = useState<{ available?: boolean; hasFace: boolean; faceSetupAt: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  async function loadStatus() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/face/status', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to check face registration. Please try again.')
      setStatus(await response.json())
    } catch {
      setError('Unable to check face registration. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadStatus() }, [])

  if (loading || status?.available !== true) return null

  return <section className="bg-white rounded-xl border border-gray-200 p-6" aria-labelledby="face-registration-title">
    <h3 id="face-registration-title" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
      <ScanFace className="w-4 h-4 shrink-0" /> Facial Recognition <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800 normal-case tracking-normal">Beta</Badge>
    </h3>
    <p className="text-sm text-gray-600 mb-3">Register your own face using your device camera for attendance verification and your company’s office kiosk. Your company must enable facial recognition in Attendance Settings to use it.</p>
    {loading ? <AppSpinner size="md" message="Checking face registration..." className="py-10" />
      : error ? <div className="space-y-3"><p className="text-sm text-red-600" role="alert">{error}</p><Button type="button" variant="outline" onClick={() => void loadStatus()}>Retry</Button></div>
      : <div className="space-y-3">
        <p className="text-sm font-medium flex items-center gap-2" role="status">
          {status?.hasFace && <ShieldCheck className="w-4 h-4 text-green-600" />}
          {status?.hasFace ? 'Face registered' : 'No face registered yet'}
        </p>
        {status?.hasFace && status.faceSetupAt && <p className="text-xs text-gray-500">Last registered: {new Date(status.faceSetupAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' })}</p>}
        <p className="text-xs text-gray-500">Use good lighting and keep only your face in view. You will review the consent information before the camera opens.{status?.hasFace ? ' Registering again replaces your previous face registration.' : ''}</p>
        <div className="flex justify-end"><Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}><ScanFace className="w-4 h-4 mr-2" />{status?.hasFace ? 'Re-register Face' : 'Register Face'}</Button></div>
      </div>}
    {open && <FaceEnrollDialog onClose={() => setOpen(false)} onEnrolled={() => { setStatus({ available: true, hasFace: true, faceSetupAt: new Date().toISOString() }); void loadStatus() }} />}
  </section>
}

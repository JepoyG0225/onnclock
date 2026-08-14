'use client'

/**
 * Face enrolment — captures several descriptors and stores the average.
 *
 * POSTs to /api/face/setup, which averages the samples into one reference
 * embedding and re-normalises it. Several samples matter: a single frame bakes
 * in whatever expression and angle happened at that instant, and the employee
 * then fails to match themselves later.
 *
 * Consent is explicit and recorded (faceConsentAt). Biometric data is personal
 * information under the PH Data Privacy Act, so enrolment is opt-in with the
 * retention terms stated before the camera opens — not buried afterwards.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, X, Loader2 } from 'lucide-react'
import { FaceMeshScanner } from '@/components/employee/FaceMeshScanner'
import { FACE_MODEL_ID } from '@/lib/face/face-api'

const NAVY = 'var(--brand-primary)'

export function FaceEnrollDialog({
  onClose,
  onEnrolled,
}: {
  onClose: () => void
  onEnrolled: () => void
}) {
  const [consented, setConsented] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleComplete(descriptors: number[][], photo: string | null) {
    setSaving(true)
    try {
      const res = await fetch('/api/face/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeddings: descriptors,
          model: FACE_MODEL_ID,
          consent: true,
          photo,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Could not save your face (${res.status})`)
      }
      toast.success('Face set up — you can now clock in with face verification')
      onEnrolled()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your face')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[17px] font-black" style={{ color: NAVY }}>Set up face</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {!consented ? (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="space-y-2 text-[13px] text-slate-600 leading-relaxed">
                <p>
                  Your face is turned into a set of numbers (a mathematical signature)
                  used only to confirm it is you when you clock in.
                </p>
                <p>
                  <span className="font-bold text-slate-800">No video is uploaded.</span>{' '}
                  Only that signature and a single reference photo are stored, and matching
                  happens against your own record — never against anyone else&apos;s.
                </p>
                <p className="text-slate-400 text-[12px]">
                  You can ask your HR admin to remove it at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConsented(true)}
                className="w-full py-3.5 rounded-2xl text-[14px] font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--brand-highlight))` }}
              >
                I agree — start scan
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-[13px] font-bold text-slate-400"
              >
                Not now
              </button>
            </div>
          ) : saving ? (
            <div className="py-14 flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: NAVY }} />
              <p className="text-[13px] font-semibold text-slate-500">Saving your face…</p>
            </div>
          ) : (
            <FaceMeshScanner
              samples={5}
              capturePhoto
              onComplete={handleComplete}
              hint="Look straight at the camera in good light. Move slightly between captures."
            />
          )}
        </div>
      </div>
    </div>
  )
}

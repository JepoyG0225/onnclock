'use client'

/**
 * Face verification gate, shown before a punch when the company requires it.
 *
 * Captures three descriptors and sends them to /api/face/verify, which scores
 * each against the stored reference and takes the best. Several frames matter
 * because one unlucky blink or angle would otherwise reject a legitimate
 * employee and leave them unable to clock in.
 *
 * The decision is made SERVER-side. The stored embedding never reaches the
 * browser, so a tampered client cannot fake a match — it can only submit
 * descriptors and be told no.
 */
import { useState } from 'react'
import { X, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { FaceMeshScanner } from '@/components/employee/FaceMeshScanner'
import { FACE_MODEL_ID } from '@/lib/face/face-api'

const NAVY = '#032b63'

type Result = { ok: boolean; score: number; threshold: number }

export function FaceVerifyDialog({
  title = 'Verify your face',
  onVerified,
  onCancel,
}: {
  title?: string
  onVerified: () => void
  onCancel: () => void
}) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Remounts the scanner on retry — a fresh camera session and a clean mesh. */
  const [attempt, setAttempt] = useState(0)

  async function handleComplete(descriptors: number[][]) {
    setChecking(true)
    setError(null)
    try {
      const res = await fetch('/api/face/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeddings: descriptors, model: FACE_MODEL_ID }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // 409 means the stored embedding came from a different model, so the
        // employee has to enrol again — say that rather than "no match".
        throw new Error(body?.error || `Verification failed (${res.status})`)
      }
      setResult(body as Result)
      if (body?.ok) {
        // Brief pause so the success state is actually seen before the dialog
        // closes and the punch proceeds.
        setTimeout(onVerified, 700)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setChecking(false)
    }
  }

  const failed = result !== null && !result.ok

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[17px] font-black" style={{ color: NAVY }}>{title}</h2>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {result?.ok ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-[15px] font-black text-slate-900">Face verified</p>
              <p className="text-[12px] font-semibold text-slate-400">
                Match {(result.score * 100).toFixed(1)}%
              </p>
            </div>
          ) : checking ? (
            <div className="py-14 flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: NAVY }} />
              <p className="text-[13px] font-semibold text-slate-500">Checking…</p>
            </div>
          ) : failed || error ? (
            <div className="space-y-4">
              <div className="py-6 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                  <ShieldAlert className="w-8 h-8 text-red-600" />
                </div>
                <p className="text-[15px] font-black text-slate-900">
                  {error ? 'Could not verify' : 'Face did not match'}
                </p>
                <p className="text-[12px] text-slate-500 leading-relaxed max-w-[16rem]">
                  {error ??
                    `Match ${(result!.score * 100).toFixed(1)}%, below the ${(result!.threshold * 100).toFixed(0)}% required. Try again in better light, facing the camera directly.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setResult(null); setError(null); setAttempt(a => a + 1) }}
                className="w-full py-3.5 rounded-2xl text-[14px] font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: `linear-gradient(135deg, #021e47, ${NAVY})` }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2 text-[13px] font-bold text-slate-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <FaceMeshScanner
              key={attempt}
              samples={3}
              accent="#10b981"
              onComplete={handleComplete}
              hint="Look at the camera and hold still."
            />
          )}
        </div>
      </div>
    </div>
  )
}

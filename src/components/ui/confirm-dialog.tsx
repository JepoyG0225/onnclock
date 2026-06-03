'use client'

import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Variant = 'warning' | 'danger' | 'default'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: Variant
  onConfirm: () => void
  onCancel: () => void
}

const VARIANT_TONE: Record<Variant, { iconBg: string; iconText: string; button: string }> = {
  warning: {
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  danger: {
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  default: {
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
    button: 'bg-slate-700 hover:bg-slate-800 text-white',
  },
}

/**
 * Lightweight portal-rendered confirm dialog used across the app for
 * destructive / sensitive actions (deletes, resets, recomputes).
 *
 * Kept dependency-free on purpose — same shape as the earlier inline
 * confirm modals throughout the codebase so call sites can adopt it
 * without behavioral surprises.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open || typeof document === 'undefined') return null
  const tone = VARIANT_TONE[variant]

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${tone.iconBg} flex-shrink-0`}>
            <AlertTriangle className={`w-5 h-5 ${tone.iconText}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {description && (
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" className={tone.button} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

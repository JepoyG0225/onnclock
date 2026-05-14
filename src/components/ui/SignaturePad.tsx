'use client'

/**
 * Canvas-based signature pad. Captures pointer events (mouse + touch),
 * smooths the stroke, and exposes the result as a PNG data URL.
 *
 * Usage:
 *   const padRef = useRef<SignaturePadHandle>(null)
 *   <SignaturePad ref={padRef} />
 *   const dataUrl = padRef.current?.toDataURL()
 *   padRef.current?.clear()
 *
 * The pad is intentionally framework-agnostic (no Tailwind class names
 * required beyond a wrapper) so it can drop into both the HR dashboard
 * and the employee portal.
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react'
import { Eraser } from 'lucide-react'

export interface SignaturePadHandle {
  /** Serialize the current pad to a PNG data URL. Returns null if empty. */
  toDataURL: () => string | null
  /** Clear the canvas. */
  clear: () => void
  /** True if any stroke has been drawn. */
  isEmpty: () => boolean
  /** Programmatically load an existing data URL onto the canvas. */
  fromDataURL: (dataUrl: string) => void
}

interface SignaturePadProps {
  width?: number
  height?: number
  className?: string
  onChange?: (isEmpty: boolean) => void
  initialDataUrl?: string | null
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ width = 480, height = 180, className, onChange, initialDataUrl }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const dirtyRef = useRef(false)
    const [, setTick] = useState(0)

    const getCtx = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      return { canvas, ctx }
    }, [])

    const resetSurface = useCallback(() => {
      const refs = getCtx()
      if (!refs) return
      const { canvas, ctx } = refs
      const dpr = window.devicePixelRatio || 1
      // Reset transform before resizing so CSS pixels match device pixels.
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#1A2D42'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }, [getCtx, width, height])

    useEffect(() => {
      resetSurface()
      if (initialDataUrl) {
        const img = new Image()
        img.onload = () => {
          const refs = getCtx()
          if (!refs) return
          refs.ctx.drawImage(img, 0, 0, width, height)
          dirtyRef.current = true
          onChange?.(false)
          setTick(t => t + 1)
        }
        img.src = initialDataUrl
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetSurface, width, height])

    const pointFromEvent = useCallback((e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }, [])

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const refs = getCtx()
      const pt = pointFromEvent(e)
      if (!refs || !pt) return
      drawingRef.current = true
      lastPointRef.current = pt
      canvasRef.current?.setPointerCapture(e.pointerId)
      refs.ctx.beginPath()
      refs.ctx.moveTo(pt.x, pt.y)
      // Render a tiny dot so a tap registers visibly
      refs.ctx.lineTo(pt.x + 0.1, pt.y + 0.1)
      refs.ctx.stroke()
    }

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const refs = getCtx()
      const pt = pointFromEvent(e)
      if (!refs || !pt || !lastPointRef.current) return
      refs.ctx.beginPath()
      refs.ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      refs.ctx.lineTo(pt.x, pt.y)
      refs.ctx.stroke()
      lastPointRef.current = pt
      if (!dirtyRef.current) {
        dirtyRef.current = true
        onChange?.(false)
        setTick(t => t + 1)
      }
    }

    const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawingRef.current = false
      lastPointRef.current = null
      canvasRef.current?.releasePointerCapture(e.pointerId)
    }

    const clear = useCallback(() => {
      dirtyRef.current = false
      resetSurface()
      onChange?.(true)
      setTick(t => t + 1)
    }, [resetSurface, onChange])

    useImperativeHandle(ref, () => ({
      toDataURL: () => {
        if (!dirtyRef.current) return null
        return canvasRef.current?.toDataURL('image/png') ?? null
      },
      clear,
      isEmpty: () => !dirtyRef.current,
      fromDataURL: (dataUrl: string) => {
        resetSurface()
        const img = new Image()
        img.onload = () => {
          const refs = getCtx()
          if (!refs) return
          refs.ctx.drawImage(img, 0, 0, width, height)
          dirtyRef.current = true
          onChange?.(false)
          setTick(t => t + 1)
        }
        img.src = dataUrl
      },
    }), [clear, getCtx, resetSurface, onChange, width, height])

    return (
      <div className={className}>
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={onPointerEnd}
            style={{
              touchAction: 'none',
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              background: '#ffffff',
              cursor: 'crosshair',
              display: 'block',
              width,
              height,
            }}
          />
          {!dirtyRef.current && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-gray-300 font-medium tracking-wide"
            >
              Sign here
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
          <span>Use your mouse or finger to draw your signature.</span>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Eraser className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>
    )
  },
)

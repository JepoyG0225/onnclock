'use client'

/**
 * Live face scanner with an animated landmark mesh.
 *
 * Runs entirely in the browser: face-api.js detects a face, extracts the 68
 * landmarks and a 128-float descriptor, and only the descriptor is ever sent to
 * the server. No video frames leave the device unless the caller asks for a
 * still via onCapturePhoto.
 *
 * Two loops, deliberately at different rates:
 *   - detection runs on a timer (~8/sec) because it is the expensive part;
 *   - drawing runs on requestAnimationFrame so the mesh animation stays smooth
 *     between detections instead of stepping at the detection rate.
 *
 * The mesh animates in dot by dot: once a face is held steady the landmarks
 * reveal in index order and the wireframe segments join up behind them, which
 * doubles as an honest progress indicator — a complete mesh means enough stable
 * frames have been seen to sample a descriptor.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, CameraOff, ScanFace } from 'lucide-react'
import {
  loadFaceApi, FACE_MESH_PATHS, LANDMARK_COUNT, DESCRIPTOR_LENGTH,
} from '@/lib/face/face-api'

type Phase = 'loading' | 'no-camera' | 'searching' | 'scanning' | 'done' | 'error'

export interface FaceMeshScannerProps {
  /** How many descriptors to collect before calling onComplete. */
  samples?: number
  /** Fires once `samples` descriptors have been gathered. */
  onComplete: (descriptors: number[][], photo: string | null) => void
  /** Include a still frame with the result (enrolment stores one). */
  capturePhoto?: boolean
  /** Tint of the mesh. Defaults to brand orange. */
  accent?: string
  /** Shown under the viewport. */
  hint?: string
}

/** How long the reveal takes once a face is held, in ms. */
const REVEAL_MS = 900
/** Detection cadence. 8/sec is smooth enough and leaves the main thread free. */
const DETECT_INTERVAL_MS = 125

export function FaceMeshScanner({
  samples = 5,
  onComplete,
  capturePhoto = false,
  accent = 'var(--brand-highlight)',
  hint,
}: FaceMeshScannerProps) {
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef    = useRef<number | null>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Latest landmark points in DISPLAY coordinates, or null when no face. */
  const pointsRef = useRef<Array<{ x: number; y: number }> | null>(null)
  /** When the current continuous face-hold started. Reset whenever it is lost. */
  const holdStartRef = useRef<number | null>(null)
  const descriptorsRef = useRef<number[][]>([])
  /** Guards against onComplete firing twice if a frame lands mid-teardown. */
  const finishedRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [collected, setCollected] = useState(0)

  // ── Drawing ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Match the backing store to the element's displayed size so the mesh lands
    // on the face rather than at an offset.
    const w = video.clientWidth
    const h = video.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, w, h)

    const pts = pointsRef.current
    if (!pts || pts.length < LANDMARK_COUNT) return

    const held = holdStartRef.current ? Date.now() - holdStartRef.current : 0
    const progress = Math.min(1, held / REVEAL_MS)
    const revealed = Math.floor(progress * LANDMARK_COUNT)

    // Wireframe first so the dots sit on top of the lines.
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.35
    for (const path of FACE_MESH_PATHS) {
      // Only the portion of each run whose points have appeared.
      const last = Math.min(path.to, revealed - 1)
      if (last <= path.from) continue
      ctx.beginPath()
      ctx.moveTo(pts[path.from].x, pts[path.from].y)
      for (let i = path.from + 1; i <= last; i++) ctx.lineTo(pts[i].x, pts[i].y)
      if (path.closed && last === path.to) ctx.closePath()
      ctx.stroke()
    }

    // Dots, newest ones popping slightly larger before settling.
    ctx.globalAlpha = 1
    ctx.fillStyle = accent
    for (let i = 0; i < revealed; i++) {
      const age = revealed - i
      const r = age < 4 ? 3.2 - age * 0.4 : 1.8
      ctx.beginPath()
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // A soft halo on the most recent dot gives the reveal a leading edge.
    if (revealed > 0 && revealed < LANDMARK_COUNT) {
      const p = pts[revealed - 1]
      ctx.globalAlpha = 0.25
      ctx.beginPath()
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }, [accent])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const faceapi = await loadFaceApi()
        if (cancelled) return

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => null)
        if (cancelled) return

        setPhase('searching')

        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5,
        })

        // Render loop — cheap, every frame.
        const renderLoop = () => {
          draw()
          rafRef.current = requestAnimationFrame(renderLoop)
        }
        rafRef.current = requestAnimationFrame(renderLoop)

        // Detection loop — expensive, throttled.
        timerRef.current = setInterval(async () => {
          const v = videoRef.current
          if (!v || v.readyState < 2 || finishedRef.current) return

          const result = await faceapi
            .detectSingleFace(v, options)
            .withFaceLandmarks()
            .withFaceDescriptor()

          if (cancelled || finishedRef.current) return

          if (!result) {
            pointsRef.current = null
            holdStartRef.current = null
            setPhase('searching')
            return
          }

          // Map from the video's intrinsic resolution to its displayed size.
          const resized = faceapi.resizeResults(result, {
            width: v.clientWidth,
            height: v.clientHeight,
          })
          pointsRef.current = resized.landmarks.positions.map(p => ({ x: p.x, y: p.y }))

          if (holdStartRef.current === null) holdStartRef.current = Date.now()
          setPhase('scanning')

          // Sample only once the mesh has fully drawn, so every descriptor comes
          // from a face that stayed put — a moving face yields a poor embedding.
          const held = Date.now() - holdStartRef.current
          if (held < REVEAL_MS) return

          const descriptor = Array.from(result.descriptor as Float32Array)
          if (descriptor.length !== DESCRIPTOR_LENGTH) return

          descriptorsRef.current.push(descriptor)
          setCollected(descriptorsRef.current.length)
          // Restart the reveal so each sample needs its own steady hold rather
          // than firing every tick once the first one lands.
          holdStartRef.current = Date.now()

          if (descriptorsRef.current.length >= samples) {
            finishedRef.current = true
            setPhase('done')

            let photo: string | null = null
            if (capturePhoto) {
              const c = document.createElement('canvas')
              c.width = v.videoWidth
              c.height = v.videoHeight
              const cx = c.getContext('2d')
              if (cx) {
                cx.drawImage(v, 0, 0, c.width, c.height)
                photo = c.toDataURL('image/jpeg', 0.8)
              }
            }
            onComplete(descriptorsRef.current, photo)
          }
        }, DETECT_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        const name = (err as { name?: string })?.name
        if (name === 'NotAllowedError' || name === 'NotFoundError') {
          setPhase('no-camera')
          setMessage(
            name === 'NotAllowedError'
              ? 'Camera access was blocked. Allow it in your browser settings and try again.'
              : 'No camera found on this device.',
          )
        } else {
          setPhase('error')
          setMessage(err instanceof Error ? err.message : 'Could not start the scanner.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      // Releasing the tracks is what turns the camera light off. Without this
      // the stream stays live after the dialog closes.
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [draw, samples, onComplete, capturePhoto])

  const statusText =
    phase === 'loading'   ? 'Loading face models…'
    : phase === 'searching' ? 'Position your face in the circle'
    : phase === 'scanning'  ? `Hold still… ${collected}/${samples}`
    : phase === 'done'      ? 'Face captured'
    : message ?? 'Scanner unavailable'

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto rounded-3xl overflow-hidden bg-slate-900"
        style={{ width: '100%', maxWidth: 320, aspectRatio: '3 / 4' }}
      >
        {/* Mirrored so it reads as a mirror, which is what people expect of a
            selfie view. The canvas is mirrored with it so the mesh tracks. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Framing guide */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="rounded-full transition-colors duration-300"
            style={{
              width: '68%',
              aspectRatio: '1',
              border: `2px dashed ${phase === 'scanning' || phase === 'done' ? accent : 'rgba(255,255,255,0.35)'}`,
            }}
          />
        </div>

        {(phase === 'loading' || phase === 'no-camera' || phase === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/85 px-6 text-center">
            {phase === 'loading'
              ? <Loader2 className="w-7 h-7 text-white/80 animate-spin" />
              : <CameraOff className="w-7 h-7 text-white/60" />}
            <p className="text-[12px] font-semibold text-white/80 leading-relaxed">{statusText}</p>
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
          <ScanFace className="w-3.5 h-3.5" style={{ color: accent }} />
          {statusText}
        </p>
        {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      </div>

      {/* Sample progress — meaningful during enrolment, where several are taken. */}
      {samples > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: samples }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i < collected ? 22 : 10,
                background: i < collected ? accent : '#d4d4d4',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

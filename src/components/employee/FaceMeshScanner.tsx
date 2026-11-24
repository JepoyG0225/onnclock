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
import { BlinkChallenge } from '@/lib/face/blink-challenge'
import { FaceScanRearm } from '@/lib/face/scan-cycle'
import {
  loadFaceApi, FACE_MESH_PATHS, LANDMARK_COUNT, DESCRIPTOR_LENGTH,
} from '@/lib/face/face-api'

type Phase = 'loading' | 'no-camera' | 'searching' | 'blink' | 'scanning' | 'done' | 'error'

export interface FaceMeshScannerProps {
  /** How many descriptors to collect before calling onComplete. */
  fullScreen?: boolean
  scanEffect?: boolean
  requireBlink?: boolean
  /** Keep the camera open; rearm only after the person leaves the frame. */
  continuous?: boolean
  onReady?: () => void
  onEyePrompt?: (step: 'open' | 'close' | 'reopen') => void
  samples?: number
  /** Stable hold per sample; enrollment keeps the slower default. */
  sampleHoldMs?: number
  /** Fires once `samples` descriptors have been gathered. */
  onComplete: (descriptors: number[][], photo: string | null) => void | Promise<void>
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
  fullScreen = false,
  scanEffect = false,
  requireBlink = false,
  continuous = false,
  onReady,
  onEyePrompt,
  samples = 5,
  sampleHoldMs = REVEAL_MS,
  onComplete,
  capturePhoto = false,
  accent = 'var(--brand-highlight)',
  hint,
}: FaceMeshScannerProps) {
  const holdMs = Math.max(250, sampleHoldMs)
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
  const blink = useRef(new BlinkChallenge())
  const eyePrompt = useRef<string | null>(null)
  const blinkStartedAt = useRef<number | null>(null)
  const detectingRef = useRef(false)
  const rearm = useRef(new FaceScanRearm())

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
    const progress = holdStartRef.current === null ? 1 : Math.min(1, held / holdMs)
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
  }, [accent, holdMs])

  useEffect(() => {
    let cancelled = false
    finishedRef.current = false
    detectingRef.current = false
    descriptorsRef.current = []
    pointsRef.current = null
    holdStartRef.current = null
    blink.current.reset()
    eyePrompt.current = null
    blinkStartedAt.current = null
    setCollected(0)
    setPhase('loading')

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
        await video.play()
        if (cancelled) return

        setPhase('searching')

        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.35,
        })

        const frame = document.createElement('canvas')

        // Render loop — cheap, every frame.
        const renderLoop = () => {
          draw()
          rafRef.current = requestAnimationFrame(renderLoop)
        }
        rafRef.current = requestAnimationFrame(renderLoop)

        // Detection loop — expensive, throttled.
        timerRef.current = setInterval(async () => {
          const v = videoRef.current
          if (!v || v.readyState < 2 || (finishedRef.current && !continuous) || detectingRef.current) return
          detectingRef.current = true
          try {

          // Freeze each frame so landmarks and descriptors use the same pixels.
          const capturedAt = Date.now()
          frame.width = v.videoWidth; frame.height = v.videoHeight
          const frameContext = frame.getContext('2d')
          if (!frameContext || !frame.width || !frame.height) return
          frameContext.drawImage(v, 0, 0)
          // Recognition is intentionally deferred: running it for every preview
          // frame can miss the closed-eye moment on slower Android devices.
          const faces = await faceapi.detectAllFaces(frame, options).withFaceLandmarks()
          const result = faces.length === 1 ? faces[0] : null

          if (cancelled) return
          if (finishedRef.current) {
            pointsRef.current = null
            if (rearm.current.observe(faces?.length ?? (result ? 1 : 0), Date.now())) {
              finishedRef.current = false; blink.current.reset()
              descriptorsRef.current = []; holdStartRef.current = null
              setCollected(0); setMessage(null); setPhase('searching'); onReady?.()
            }
            return
          }

          if (!result) {
            pointsRef.current = null
            holdStartRef.current = null
            setPhase('searching')
            blink.current.reset(); eyePrompt.current = null; blinkStartedAt.current = null; descriptorsRef.current = []; setCollected(0); setMessage(faces.length > 1 ? 'Multiple faces detected. Only one person should be in view.' : 'No face detected. Face the camera, move closer, and use good lighting.');
            return
          }

          // Map from the video's intrinsic resolution to its displayed size.
          // Match object-cover cropping instead of stretching the landmarks.
          const scale = Math.max(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight)
          const offsetX = (v.clientWidth - v.videoWidth * scale) / 2
          const offsetY = (v.clientHeight - v.videoHeight * scale) / 2
          pointsRef.current = result.landmarks.positions.map(p => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }))

          if (requireBlink && !blink.current.done) {
            const points = result.landmarks.positions
            const dist = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y)
            const eye = (i: number) => (dist(i + 1, i + 5) + dist(i + 2, i + 4)) / (2 * dist(i, i + 3))
            blinkStartedAt.current ??= capturedAt
            if (capturedAt - blinkStartedAt.current > 20000) {
              finishedRef.current = true
              setPhase('error')
              setMessage('Eye movement could not be confirmed. Cancel and retry in brighter light, keeping your face close to the camera. Follow each eye prompt before moving to the next step.')
              return
            }
            const step = blink.current.observe((eye(36) + eye(42)) / 2, capturedAt)
            setMessage(step === 'open' ? '1. Keep your eyes open. Look straight at the camera.' : step === 'close' ? '2. Close your eyes and hold until asked to open.' : step === 'reopen' ? '3. Open your eyes now.' : 'Eye check complete. Hold still.')
            if (step !== 'done' && eyePrompt.current !== step) { eyePrompt.current = step; onEyePrompt?.(step) }
            holdStartRef.current = null
            setPhase('blink')
            if (step !== 'done') return
          }
          if (holdStartRef.current === null) holdStartRef.current = Date.now()
          setPhase('scanning')

          // Sample only once the mesh has fully drawn, so every descriptor comes
          // from a face that stayed put — a moving face yields a poor embedding.
          const held = Date.now() - holdStartRef.current
          if (held < holdMs) return

          const [alignedFace] = await faceapi.extractFaces(frame, [result.landmarks.align(undefined, { useDlibAlignment: true })])
          if (!alignedFace || cancelled) return
          const descriptor = Array.from(await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(alignedFace) as Float32Array)
          if (cancelled) return
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
                cx.drawImage(frame, 0, 0, c.width, c.height)
                photo = c.toDataURL('image/jpeg', 0.8)
              }
            }
            await onComplete(descriptorsRef.current, photo)
            if (continuous) rearm.current.finish(Date.now())
          }
          } catch { if (!cancelled) { setPhase('error'); setMessage('Camera scan failed. Close and try again.'); } }
          finally { detectingRef.current = false }
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
  }, [draw, samples, onComplete, capturePhoto, requireBlink, continuous, onReady, holdMs, onEyePrompt])

  const statusText =
    phase === 'loading'   ? ''
    : phase === 'searching' ? (message || (requireBlink ? 'Look at the camera and blink slowly' : 'Position your face in the circle'))
    : phase === 'blink' ? message || 'Face detected. Blink slowly.'
    : phase === 'scanning'  ? `Hold still… ${collected}/${samples}`
    : phase === 'done'      ? (continuous ? 'Step away to let the next employee scan' : 'Face captured')
    : message ?? 'Scanner unavailable'

  return (
    <div className={fullScreen ? "kiosk-full-camera" : "space-y-3"}>
      <div
        className={fullScreen ? "kiosk-full-viewport" : "relative mx-auto rounded-3xl overflow-hidden bg-slate-900"}
        style={fullScreen ? undefined : { width: '100%', maxWidth: 320, aspectRatio: '3 / 4' }}
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

        {scanEffect && (phase === 'searching' || phase === 'blink' || phase === 'scanning') && <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="kiosk-scan-beam absolute left-0 right-0 h-1 bg-cyan-300 shadow-[0_0_24px_8px_rgba(34,211,238,0.45)]" />
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold tracking-widest text-cyan-200">{phase === 'scanning' ? 'CAPTURING FACE' : phase === 'blink' ? 'FACE DETECTED' : 'LIVE SCANNER'}</span>
        </div>}
        {/* Framing guide */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="rounded-full transition-colors duration-300"
            style={{
              width: '68%',
              aspectRatio: '1',
              border: `2px dashed ${phase === 'blink' || phase === 'scanning' || phase === 'done' ? accent : 'rgba(255,255,255,0.35)'}`,
            }}
          />
        </div>

        {(phase === 'loading' || phase === 'no-camera' || phase === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/85 px-6 text-center">
            {phase === 'loading'
              ? <Loader2 role="status" aria-label="Starting camera" className="w-7 h-7 text-white/80 animate-spin" />
              : <CameraOff className="w-7 h-7 text-white/60" />}
            {statusText && <p className="text-[12px] font-semibold text-white/80 leading-relaxed">{statusText}</p>}
          </div>
        )}
      </div>

      {phase !== 'loading' && <div className={fullScreen ? "kiosk-full-status" : "text-center"}>
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-600">
          <ScanFace className="w-3.5 h-3.5" style={{ color: accent }} />
          {statusText}
        </p>
        {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      </div>}

      {/* Sample progress — meaningful during enrolment, where several are taken. */}
      {phase !== 'loading' && samples > 1 && (
        <div className={fullScreen ? "kiosk-full-progress flex items-center justify-center gap-1.5" : "flex items-center justify-center gap-1.5"}>
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

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { startAuthentication } from '@simplewebauthn/browser'
import { format, differenceInSeconds } from 'date-fns'
import { MapPin, Clock, AlertCircle, Loader2, RefreshCw, Calendar, Coffee, Monitor, CalendarDays, Fingerprint} from 'lucide-react'
import { toast } from 'sonner'
import { FaceEnrollDialog } from '@/components/employee/FaceEnrollDialog'
import { FaceVerifyDialog } from '@/components/employee/FaceVerifyDialog'
import dynamic from 'next/dynamic'

// react-leaflet touches `window` at module scope, so it cannot be evaluated on
// the server. This used to be a plain import and was fine while /portal/clock
// was the client entry point; once the home screen (a server component) started
// rendering this, SSR walked into leaflet and threw
// "ReferenceError: window is not defined". ssr:false keeps the map client-only.
const PortalLocationMap = dynamic(
  () => import('@/components/employee/PortalLocationMap').then(m => m.PortalLocationMap),
  { ssr: false },
)

interface TodayRecord {
  id: string
  timeIn: string | null
  timeOut: string | null
  breakIn: string | null
  breakOut: string | null
  regularHours: number | null
  overtimeHours: number | null
  lateMinutes: number | null
  clockInLat: number | null
  clockInLng: number | null
  clockInAddress: string | null
  clockOutLat: number | null
  clockOutLng: number | null
  clockOutAddress: string | null
  isHoliday: boolean
  holidayType: string | null
}

interface GeoPosition {
  lat: number
  lng: number
  accuracy: number
  address?: string
  capturedAt: number
}

interface ScreenCaptureFeature {
  entitled: boolean
  enabled: boolean
  frequencyMinutes: number
  desktopOnlyRequired: boolean
  browserClockBlocked: boolean
  isMobileDevice: boolean
  isDesktopApp: boolean
}

/**
 * The punch control and everything it depends on — GPS, geofence, biometric
 * verification, selfie capture, screen-capture policy, break handling.
 *
 * This was /portal/clock's page component. It became a component so the home
 * screen can punch directly instead of bouncing the employee to another page.
 * Both surfaces render THIS, so the clock rules can never diverge between them
 * — which is exactly what would have happened had home grown its own copy.
 *
 * Records live on /portal/clock, which renders AttendanceHistory on its own —
 * this component is purely the punch control.
 */
export function PunchClock() {
  const [record, setRecord] = useState<TodayRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [breakMinutes, setBreakMinutes] = useState(60)
  const [actionLoading, setActionLoading] = useState(false)
  const [scheduleReady, setScheduleReady] = useState(true)
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  /** Map is collapsed by default; the address alone answers the usual question. */
  const [showMap, setShowMap] = useState(false)
  // The API distinguishes "rest day" from "no schedule" only inside the message
  // text, so the dialog reads it the same way the old banner did.
  const isRestDayMessage = !!scheduleMessage?.toLowerCase().includes('rest day')
  const [geoPos, setGeoPos] = useState<GeoPosition | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [pulse, setPulse] = useState<'in' | 'out' | null>(null)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [biometricRequired, setBiometricRequired] = useState(true)
  const [biometricLoading, setBiometricLoading] = useState(true)
  const [lastBiometricOkAt, setLastBiometricOkAt] = useState<Date | null>(null)
  const [geofence, setGeofence] = useState<{
    enabled: boolean
    lat: number | null
    lng: number | null
    radiusMeters: number | null
    configured: boolean
  } | null>(null)
  const [selfieRequired, setSelfieRequired] = useState(false)
  const [faceRequired, setFaceRequired] = useState(false)
  const [faceEnrolled, setFaceEnrolled] = useState(false)
  const [showFaceEnroll, setShowFaceEnroll] = useState(false)
  /**
   * Set while a punch is waiting on face verification. Holds the action to run
   * once the face matches, so the guard chain resumes exactly where it paused
   * rather than the caller having to re-click.
   */
  const [pendingFaceAction, setPendingFaceAction] = useState<null | (() => void)>(null)
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null)
  const [screenCaptureFeature, setScreenCaptureFeature] = useState<ScreenCaptureFeature | null>(null)
  const [screenCaptureBlocked, setScreenCaptureBlocked] = useState(false)
  const [screenCaptureUnavailable, setScreenCaptureUnavailable] = useState(false)
  const [desktopRequired, setDesktopRequired] = useState(false)
  const [lastCapturedAt, setLastCapturedAt] = useState<Date | null>(null)
  const [captureCount, setCaptureCount] = useState(0)
  const screenCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const screenCaptureStreamRef = useRef<MediaStream | null>(null)
  const screenCaptureVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenCaptureInFlightRef = useRef(false)
  // Holds the clock action to auto-execute after biometric verification
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // GPS ping interval while clocked in
  useEffect(() => {
    if (!record?.timeIn || record.timeOut) return
    const interval = setInterval(() => {
      if (geoPos) {
        fetch('/api/locations/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: geoPos.lat, lng: geoPos.lng, accuracy: geoPos.accuracy }),
        }).catch(() => null)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [record, geoPos])

  const loadRecord = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/attendance/today')
      const data = await res.json()
      setRecord(data.record)
      setScheduleReady(data.scheduleReady !== false)
      setScheduleMessage(typeof data.scheduleMessage === 'string' ? data.scheduleMessage : null)
      if (typeof data.breakMinutes === 'number') setBreakMinutes(data.breakMinutes)
    } catch {
      toast.error("Failed to load today's record")
    } finally {
      setLoading(false)
    }
  }, [])


  const loadBiometricStatus = useCallback(async () => {
    setBiometricLoading(true)
    try {
      const res = await fetch('/api/biometric/status', { cache: 'no-store' })
      const data = await res.json()
      setBiometricEnrolled(!!data.enrolled)
      setBiometricRequired(data.required !== false)
    } catch {
      setBiometricEnrolled(false)
      setBiometricRequired(true)
    } finally {
      setBiometricLoading(false)
    }
  }, [])

  const stopScreenCaptureLoop = useCallback(() => {
    if (screenCaptureIntervalRef.current) {
      clearInterval(screenCaptureIntervalRef.current)
      screenCaptureIntervalRef.current = null
    }
    if (screenCaptureStreamRef.current) {
      for (const track of screenCaptureStreamRef.current.getTracks()) track.stop()
      screenCaptureStreamRef.current = null
    }
    screenCaptureVideoRef.current = null
    screenCaptureInFlightRef.current = false
  }, [])

  const ensureScreenCaptureStream = useCallback(async () => {
    if (screenCaptureStreamRef.current) return screenCaptureStreamRef.current
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen capture is not supported on this browser.')
    }

    // Request full screen/window capture.
    // displaySurface:'monitor' hints the browser to pre-select the entire screen
    // in the picker (user still confirms). Once granted the stream stays alive
    // and we draw frames from it on a canvas at each capture interval.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
        frameRate: 1,          // 1 fps is enough — we only need still frames
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })
    const track = stream.getVideoTracks()[0]
    track?.addEventListener('ended', () => {
      stopScreenCaptureLoop()
      setScreenCaptureUnavailable(true)
      toast.warning('Screen monitoring stopped. Please clock out and back in to resume.')
    })

    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()

    screenCaptureStreamRef.current = stream
    screenCaptureVideoRef.current = video
    return stream
  }, [stopScreenCaptureLoop])

  const captureAndUploadScreen = useCallback(async () => {
    if (screenCaptureInFlightRef.current) return
    if (!record?.id) return
    if (!screenCaptureFeature?.enabled || screenCaptureBlocked || screenCaptureUnavailable) return

    screenCaptureInFlightRef.current = true
    try {
      await ensureScreenCaptureStream()
      const video = screenCaptureVideoRef.current
      if (!video) throw new Error('Screen stream unavailable')

      // Wait for video dimensions to populate if the stream just started
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Capture at full native resolution, then downscale to max 1920px wide
      // to keep file size reasonable while preserving full-screen fidelity.
      const srcW = video.videoWidth  || 1920
      const srcH = video.videoHeight || 1080
      const scale = Math.min(1, 1920 / srcW)
      const width  = Math.max(1, Math.round(srcW * scale))
      const height = Math.max(1, Math.round(srcH * scale))

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Unable to get canvas context')
      ctx.drawImage(video, 0, 0, width, height)

      // JPEG at 0.75 quality — good balance of clarity vs payload size
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.75)

      const res = await fetch('/api/attendance/screen-captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dtrRecordId: record.id, imageDataUrl }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to upload screenshot')
      }

      // Update status badge
      setLastCapturedAt(new Date())
      setCaptureCount(c => c + 1)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        setScreenCaptureUnavailable(true)
        toast.error('Screen capture permission denied. This is required by your company attendance policy.')
      } else {
        const message = e instanceof Error ? e.message : 'Screen capture failed'
        setScreenCaptureUnavailable(true)
        toast.error(message)
      }
      stopScreenCaptureLoop()
    } finally {
      screenCaptureInFlightRef.current = false
    }
  }, [record?.id, screenCaptureFeature?.enabled, screenCaptureBlocked, screenCaptureUnavailable, ensureScreenCaptureStream, stopScreenCaptureLoop])

  useEffect(() => {
    loadRecord()
    loadBiometricStatus()
    fetch('/api/employees/me')
      .then(r => r.json())
      .then(d => {
        const e = d?.employee
        if (!e) return
        const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
        setSelfieRequired(!!e.selfieRequired)
        setFaceRequired(!!e.faceRecognitionRequired)
        setFaceEnrolled(!!e.faceEnrolled)
      })
      .catch(() => null)
    fetch('/api/attendance/geofence')
      .then(r => r.json())
      .then(d => setGeofence(d))
      .catch(() => null)
    fetch('/api/attendance/security')
      .then(r => r.json())
      .then(d => {
        const feature = d?.feature ?? null
        if (!feature) return
        setScreenCaptureFeature(feature)
        // Blocked on mobile device (can't use desktop app)
        setScreenCaptureBlocked(Boolean(feature.desktopOnlyRequired && feature.isMobileDevice))
        // Desktop app required: screen capture enabled but user is in browser, not the desktop app
        setDesktopRequired(Boolean(feature.browserClockBlocked && !feature.isDesktopApp && !feature.isMobileDevice))
      })
      .catch(() => null)
  }, [loadRecord, loadBiometricStatus])

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return null
    }
    setGeoLoading(true)
    setGeoError(null)
    const targetAccuracy = 50
    const maxWaitMs = 20000
    const permissionDeniedMessage = 'Location access is blocked. Enable it in browser site settings, then tap Refresh.'
    return new Promise<GeoPosition | null>((resolve) => {
      let best: GeolocationPosition | null = null
      let done = false

      const finish = async (pos?: GeolocationPosition | null, errMsg?: string) => {
        if (done) return
        done = true
        if (watchId !== null) navigator.geolocation.clearWatch(watchId)
        if (!pos) {
          if (errMsg) setGeoError(errMsg)
          setGeoLoading(false)
          resolve(null)
          return
        }
        const { latitude, longitude, accuracy } = pos.coords
        let address: string | undefined
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          )
          const data = await res.json()
          address = data.display_name ?? undefined
        } catch {
          // address stays undefined
        }
        const next = { lat: latitude, lng: longitude, accuracy, address, capturedAt: Date.now() }
        setGeoPos(next)
        setGeoLoading(false)
        resolve(next)
      }

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
          if (pos.coords.accuracy <= targetAccuracy) finish(pos)
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            finish(null, permissionDeniedMessage)
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      )

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            finish(null, permissionDeniedMessage)
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      )

      setTimeout(() => {
        if (done) return
        if (best) finish(best)
        else finish(null, 'Location unavailable. Please try again.')
      }, maxWaitMs)
    })
  }, [])

  useEffect(() => {
    let active = true
    let permissionStatus: PermissionStatus | null = null

    const run = async () => {
      // Always call requestLocation on every page load — this triggers the
      // browser's native permission popup whenever the state is "prompt",
      // and silently fetches a fresh position when already granted.
      if (!active) return
      void requestLocation()

      // Also watch for the user toggling location permission in browser settings.
      try {
        if (navigator.permissions?.query) {
          permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
          if (!active) return
          permissionStatus.onchange = () => {
            if (!active) return
            if (permissionStatus?.state === 'denied') {
              setGeoError('Location access is blocked. Enable it in browser site settings, then tap Refresh.')
            } else {
              void requestLocation()
            }
          }
        }
      } catch {
        // permissions API not supported — already called requestLocation above
      }
    }

    void run()
    return () => {
      active = false
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [requestLocation])

  const ensureLocation = useCallback(
    async (opts?: { forceFresh?: boolean; maxAgeMs?: number }) => {
      const forceFresh = Boolean(opts?.forceFresh)
      const maxAgeMs = opts?.maxAgeMs ?? 30_000
      const isFresh =
        !!geoPos &&
        Number.isFinite(geoPos.capturedAt) &&
        (Date.now() - geoPos.capturedAt) <= maxAgeMs

      if (!forceFresh && isFresh) return geoPos
      return await requestLocation()
    },
    [geoPos, requestLocation]
  )

  useEffect(() => {
    const onFocus = () => {
      // Re-request on focus so browser can re-prompt when permission is in prompt state.
      void ensureLocation({ forceFresh: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [ensureLocation])

  // Returns true if inside geofence (or geofence not enforced)
  function checkGeofence(pos: GeoPosition): boolean {
    if (!geofence?.enabled || !geofence.configured) return true
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(pos.lat - geofence.lat!)
    const dLng = toRad(pos.lng - geofence.lng!)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(geofence.lat!)) * Math.cos(toRad(pos.lat)) * Math.sin(dLng / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return dist <= geofence.radiusMeters!
  }

  // Authenticate with biometric; returns true if ok
  async function authenticateBiometric(): Promise<boolean> {
    // If recently verified, skip prompt (3 min grace)
    if (lastBiometricOkAt && (Date.now() - lastBiometricOkAt.getTime()) < 3 * 60 * 1000) {
      return true
    }
    try {
      const optRes = await fetch('/api/biometric/auth/options', { method: 'POST' })
      if (!optRes.ok) {
        const d = await optRes.json()
        toast.error(d.error ?? 'Failed to start authentication')
        return false
      }
      const options = await optRes.json()
      const authResp = await startAuthentication({ optionsJSON: options })
      const verRes = await fetch('/api/biometric/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      })
      const verData = await verRes.json()
      if (!verRes.ok) throw new Error(verData.error ?? 'Authentication failed')
      setLastBiometricOkAt(new Date())
      return true
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'NotAllowedError') {
        toast.error('Fingerprint authentication was cancelled.')
        return false
      }
      toast.error(e instanceof Error ? e.message : 'Authentication failed')
      return false
    }
  }

  const executeClockIn = async (pos: GeoPosition | null) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address: pos.address } : {}),
          photo: selfieRequired ? (selfiePhoto ?? undefined) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.desktopRequired) {
          setDesktopRequired(true)
          return
        }
        throw new Error(data.error ?? 'Clock in failed')
      }
      if (data.geofenceWarning) toast.warning(data.geofenceWarning)
      toast.success('Clocked in successfully!')
      setSelfiePhoto(null)
      await loadRecord()

      // Refresh location in the background after clock-in so the live map
      // stays accurate regardless of whether we used a cached position.
      requestLocation().then(bgPos => {
        if (!bgPos) return
        fetch('/api/locations/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: bgPos.lat, lng: bgPos.lng, accuracy: bgPos.accuracy }),
        }).catch(() => null)
      }).catch(() => null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clock in')
    } finally {
      setActionLoading(false)
    }
  }

  const executeClockOut = async (pos: GeoPosition | null) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          pos
            ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address: pos.address }
            : {}
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.desktopRequired) {
          setDesktopRequired(true)
          return
        }
        throw new Error(data.error ?? 'Clock out failed')
      }
      if (data.geofenceWarning) toast.warning(data.geofenceWarning)
      toast.success('Clocked out successfully!')
      stopScreenCaptureLoop()
      await loadRecord()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clock out')
    } finally {
      setActionLoading(false)
    }
  }

  const handleClockIn = async () => {
    setPulse('in')
    setTimeout(() => setPulse(null), 320)
    if (!scheduleReady) {
      // The button is no longer disabled for this, so the explanation has to
      // come from somewhere the employee can't miss. A toast auto-dismisses and
      // was easy to tap past; this is a dialog they have to acknowledge.
      //
      // It explains rather than offers a way through on purpose: the server
      // decides this. /api/attendance/clock-in returns allowed:false for a
      // missing schedule or a rest day, so "punch anyway" would just fail.
      setScheduleDialogOpen(true)
      return
    }
    if (screenCaptureBlocked) {
      toast.error('You can only clock in using a laptop or desktop device.')
      return
    }
    if (desktopRequired) return

    // Use the already-cached position if it was captured within the last 5 minutes.
    // This makes clock-in instant — no GPS wait on the critical path.
    // Only block on a fresh fix when geofencing is active and we have nothing cached.
    const MAX_CACHED_AGE_MS = 5 * 60 * 1000
    const cachedFresh = geoPos && (Date.now() - geoPos.capturedAt) <= MAX_CACHED_AGE_MS
    let pos: GeoPosition | null = cachedFresh ? geoPos : null

    if (geofence?.enabled && geofence.configured) {
      if (!pos) {
        // Geofence requires a valid position — wait for one if none cached
        pos = await ensureLocation({ maxAgeMs: MAX_CACHED_AGE_MS })
      }
      if (!pos) {
        toast.error('Location is required because geo-fencing is enabled. Please allow location access and try again.')
        return
      }
      if (!checkGeofence(pos)) {
        toast.error('You are outside the allowed clock-in area. Please move closer to the office.')
        return
      }
    }

    if (biometricRequired && !biometricEnrolled) {
      toast.error('Please enroll your fingerprint in Profile > Portal Access before clocking in.')
      return
    }
    // Face gate. Enrolment is offered inline rather than sending the employee
    // off to another screen mid-punch.
    if (faceRequired && !faceEnrolled) {
      toast.error('Set up face verification before clocking in.')
      setShowFaceEnroll(true)
      return
    }
    if (faceRequired) {
      setPendingFaceAction(() => () => { void executeClockIn(pos) })
      return
    }
    if (selfieRequired && !selfiePhoto) {
      toast.error('Please capture a selfie before clocking in.')
      return
    }
    if (biometricRequired) {
      const ok = await authenticateBiometric()
      if (!ok) return
    }
    await executeClockIn(pos)
  }

  const handleSelfieFile = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be 8MB or less')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null
      if (!value) {
        toast.error('Failed to read selfie photo')
        return
      }
      setSelfiePhoto(value)
      toast.success('Selfie captured')
    }
    reader.onerror = () => toast.error('Failed to read selfie photo')
    reader.readAsDataURL(file)
  }

  const handleClockOut = async () => {
    setPulse('out')
    setTimeout(() => setPulse(null), 320)
    if (desktopRequired) return

    // Same instant-path logic as clock-in: use cached position rather than blocking on GPS.
    const MAX_CACHED_AGE_MS = 5 * 60 * 1000
    const cachedFresh = geoPos && (Date.now() - geoPos.capturedAt) <= MAX_CACHED_AGE_MS
    let pos: GeoPosition | null = cachedFresh ? geoPos : null

    if (geofence?.enabled && geofence.configured) {
      if (!pos) {
        pos = await ensureLocation({ maxAgeMs: MAX_CACHED_AGE_MS })
      }
      if (!pos) {
        toast.error('Location is required because geo-fencing is enabled. Please allow location access and try again.')
        return
      }
      if (!checkGeofence(pos)) {
        toast.error('You are outside the allowed clock-out area. Please move closer to the office.')
        return
      }
    }
    if (biometricRequired && !biometricEnrolled) {
      toast.error('Please enroll your fingerprint in Profile > Portal Access before clocking out.')
      return
    }
    if (biometricRequired) {
      const ok = await authenticateBiometric()
      if (!ok) return
    }
    await executeClockOut(pos)
  }

  const handleBreakStart = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/break-start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start break')
      toast.success('Break started')
      await loadRecord()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to start break')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBreakEnd = async () => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/break-end', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        const msg = String(data?.error ?? 'Failed to end break')
        const isAlreadyEnded = res.status === 409 && /no active break/i.test(msg)
        if (isAlreadyEnded) {
          toast.info('Break was already ended.')
          await loadRecord()
          return
        }
        throw new Error(msg)
      }
      if (data.overBreakMinutes > 0) {
        toast.warning(`Break ended — you were ${data.overBreakMinutes} minute${data.overBreakMinutes !== 1 ? 's' : ''} over your allowed break time. This has been recorded.`)
      } else {
        toast.success('Break ended')
      }
      await loadRecord()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to end break')
    } finally {
      setActionLoading(false)
    }
  }

  const isClockedIn = !!record?.timeIn && !record?.timeOut
  const isOnBreak = !!record?.breakIn && !record?.breakOut

  // Geofence distance check (client-side pre-check)
  const geofenceStatus = (() => {
    if (!geofence?.enabled || !geofence.configured) return null
    if (!geoPos) return null
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(geoPos.lat - geofence.lat!)
    const dLng = toRad(geoPos.lng - geofence.lng!)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(geofence.lat!)) * Math.cos(toRad(geoPos.lat)) * Math.sin(dLng / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const inside = dist <= geofence.radiusMeters!
    return { dist: Math.round(dist), inside, radius: geofence.radiusMeters! }
  })()

  const geofenceActionBlocked =
    !!geofence?.enabled &&
    !!geofence?.configured &&
    (!geoPos || !geofenceStatus || !geofenceStatus.inside)

  useEffect(() => {
    if (!isClockedIn || !screenCaptureFeature?.enabled || screenCaptureBlocked || screenCaptureUnavailable) {
      stopScreenCaptureLoop()
      return
    }

    void captureAndUploadScreen()
    const intervalMs = Math.max(1, Number(screenCaptureFeature.frequencyMinutes || 5)) * 60 * 1000
    screenCaptureIntervalRef.current = setInterval(() => {
      void captureAndUploadScreen()
    }, intervalMs)

    return () => stopScreenCaptureLoop()
  }, [
    isClockedIn,
    screenCaptureFeature?.enabled,
    screenCaptureFeature?.frequencyMinutes,
    screenCaptureBlocked,
    screenCaptureUnavailable,
    captureAndUploadScreen,
    stopScreenCaptureLoop,
  ])

  const elapsedSeconds = isClockedIn && record?.timeIn && currentTime
    ? Math.max(0, differenceInSeconds(currentTime, new Date(record.timeIn)))
    : 0
  const breakSeconds = (() => {
    if (!record?.breakIn) return 0
    const start = new Date(record.breakIn)
    const end = record.breakOut ? new Date(record.breakOut) : currentTime
    if (!end) return 0
    return Math.max(0, differenceInSeconds(end, start))
  })()
  const workingSeconds = Math.max(0, elapsedSeconds - breakSeconds)
  const elapsedLabel = (() => {
    const h = Math.floor(workingSeconds / 3600)
    const m = Math.floor((workingSeconds % 3600) / 60)
    const s = workingSeconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })()

  const breakEnabled = breakMinutes > 0
  const breakElapsedSeconds = (() => {
    if (!record?.breakIn || !currentTime) return 0
    const start = new Date(record.breakIn)
    const end = record.breakOut ? new Date(record.breakOut) : currentTime
    return Math.max(0, differenceInSeconds(end, start))
  })()
  const allowedBreakSeconds = breakMinutes * 60
  const breakRemainingSeconds = Math.max(0, allowedBreakSeconds - breakElapsedSeconds)
  const isOverBreak = isOnBreak && breakElapsedSeconds > allowedBreakSeconds
  const overBreakSeconds = isOverBreak ? breakElapsedSeconds - allowedBreakSeconds : 0

  function formatBreakTimer(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Which step are we on?
  // 0 = idle, 1 = clocked in (not on break), 2 = on break, 3 = break done (ready to clock out)
  // If break disabled, only steps 0 and 3
  const clockStep = (() => {
    if (!record?.timeIn || record?.timeOut) return 0
    if (record.breakIn && record.breakOut) return 3
    if (record.breakIn && !record.breakOut) return 2
    return 1
  })()

  // Suppress unused variable lint warning — ref kept for future use
  void pendingActionRef

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      {/* The greeting and employee name that used to sit here are gone — the
          home screen shows both, and this page is reached from there, so they
          were the same two lines twice in a row. */}

      {/* The large running wall-clock and date that used to sit here are gone —
          the device already shows the time, and the home screen carries the
          date. `currentTime` is still ticking; it drives the elapsed-shift
          timer and the break countdown below. */}

      {/* Biometric enrollment reminder */}
      {!biometricLoading && biometricRequired && !biometricEnrolled && (
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <div>
            <p className="font-semibold text-red-600">Fingerprint setup required</p>
            <p className="text-xs text-red-500">Go to Profile {'>'} Portal Access to enroll your fingerprint before clocking in/out.</p>
          </div>
        </div>
      )}

      {desktopRequired && (
        <div
          className="rounded-2xl px-4 py-4 flex items-start gap-3 border"
          style={{ background: '#fff7ed', borderColor: '#fed7aa' }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(249,115,22,0.12)' }}>
            <Monitor className="w-4 h-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-800">Desktop app required</p>
            <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
              Your company has screen monitoring enabled. Clock in and out using the <span className="font-semibold">OnClock Desktop app</span> — browser clock-in is disabled.
            </p>
            {process.env.NEXT_PUBLIC_DESKTOP_APP_URL && (
              <a
                href={process.env.NEXT_PUBLIC_DESKTOP_APP_URL}
                download
                className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-semibold text-white rounded-lg px-3 py-1.5 no-underline"
                style={{ background: '#021e47' }}
              >
                <Monitor className="w-3.5 h-3.5" />
                Download OnClock Desktop
                <span className="opacity-70">↓</span>
              </a>
            )}
          </div>
        </div>
      )}

      {!desktopRequired && !!screenCaptureFeature?.enabled && process.env.NEXT_PUBLIC_DESKTOP_APP_URL && (
        <a
          href={process.env.NEXT_PUBLIC_DESKTOP_APP_URL}
          download
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors no-underline"
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Monitor className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-primary">Download OnClock Desktop</p>
            <p className="text-xs text-slate-500 mt-0.5">Silent, automatic screen monitoring — no browser prompts</p>
          </div>
          <span className="text-xs font-semibold text-accent flex-shrink-0">Windows ↓</span>
        </a>
      )}

      {!!screenCaptureFeature?.enabled && (
        <div
          className="rounded-2xl px-4 py-3 text-sm border"
          style={{
            background: screenCaptureBlocked
              ? '#fff5f5'
              : screenCaptureUnavailable
                ? '#fffbeb'
                : isClockedIn && lastCapturedAt
                  ? 'rgba(22,163,74,0.07)'
                  : 'rgba(46,65,86,0.08)',
            borderColor: screenCaptureBlocked
              ? '#fecaca'
              : screenCaptureUnavailable
                ? '#fde68a'
                : isClockedIn && lastCapturedAt
                  ? 'rgba(22,163,74,0.3)'
                  : 'rgba(46,65,86,0.2)',
          }}
        >
          <div className="flex items-start gap-2">
            <Monitor className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              screenCaptureBlocked ? 'text-red-500'
              : screenCaptureUnavailable ? 'text-amber-500'
              : isClockedIn && lastCapturedAt ? 'text-green-600'
              : 'text-[#032b63]'
            }`} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${
                screenCaptureBlocked ? 'text-red-700'
                : screenCaptureUnavailable ? 'text-amber-700'
                : isClockedIn && lastCapturedAt ? 'text-green-700'
                : 'text-primary'
              }`}>
                {screenCaptureBlocked
                  ? 'Desktop/laptop required'
                  : screenCaptureUnavailable
                    ? 'Screen capture stopped'
                    : isClockedIn && lastCapturedAt
                      ? `Screenshot taken · ${captureCount} capture${captureCount !== 1 ? 's' : ''} this session`
                      : 'Full-screen monitoring enabled'}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${
                screenCaptureBlocked ? 'text-red-600'
                : screenCaptureUnavailable ? 'text-amber-600'
                : 'text-slate-500'
              }`}>
                {screenCaptureBlocked
                  ? 'Screen monitoring requires a desktop or laptop computer.'
                  : screenCaptureUnavailable
                    ? 'Permission was revoked or the stream ended. Clock out and in again to resume monitoring.'
                    : isClockedIn && lastCapturedAt
                      ? `Last captured at ${lastCapturedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} — next in ${screenCaptureFeature.frequencyMinutes} min`
                      : `Your full screen will be captured every ${screenCaptureFeature.frequencyMinutes} minute(s) while clocked in. When prompted, select "Entire Screen".`}
              </p>
            </div>
          </div>
        </div>
      )}

      {selfieRequired && !isClockedIn && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Selfie required for this schedule</p>
            <p className="text-xs text-slate-500">Capture a selfie before clocking in.</p>
          </div>
          {selfiePhoto ? (
            <div className="space-y-2">
              <Image
                src={selfiePhoto}
                alt="Selfie preview"
                width={112}
                height={112}
                className="w-28 h-28 rounded-xl object-cover border border-slate-200"
                unoptimized
              />
              <button
                type="button"
                onClick={() => setSelfiePhoto(null)}
                className="text-xs font-semibold text-rose-600"
              >
                Remove photo
              </button>
            </div>
          ) : null}
          <label
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{ background: 'rgba(46,65,86,0.12)', color: '#032b63' }}
          >
            Capture Selfie
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => handleSelfieFile(e.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {/* Geofence status badge — only shown when inside the zone */}
      {geofence?.enabled && geofence.configured && geoPos && geofenceStatus?.inside && (
        <div
          className="rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2"
          style={{ background: 'rgba(46,65,86,0.12)', color: '#021e47' }}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#0055d4' }} />
          {`Inside allowed zone (${geofenceStatus.dist}m from office)`}
        </div>
      )}

      {/* Geofence outside-zone warning banner */}
      {geofence?.enabled && geofence.configured && geofenceStatus && !geofenceStatus.inside && (
        <div
          className="rounded-2xl px-4 py-4 flex items-start gap-3 border"
          style={{ background: '#fff5f5', borderColor: '#fecaca' }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <MapPin className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-700">You&apos;re not within the allowable area</p>
            <p className="text-xs text-red-500 mt-0.5 leading-relaxed">
              Clock in/out is restricted to within <span className="font-semibold">{geofenceStatus.radius}m</span> of the office.
              You are currently <span className="font-semibold">{geofenceStatus.dist}m</span> away. Please move closer to proceed.
            </p>
          </div>
        </div>
      )}

      {/* Geofence location-unavailable warning (geofencing on but no position yet) */}
      {geofence?.enabled && geofence.configured && !geoPos && !geoLoading && (
        <div
          className="rounded-2xl px-4 py-4 flex items-start gap-3 border"
          style={{ background: '#fff5f5', borderColor: '#fecaca' }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-700">Location required</p>
            <p className="text-xs text-red-500 mt-0.5 leading-relaxed">
              Your company requires geo-fencing for clock in/out. Please allow location access and refresh.
            </p>
          </div>
        </div>
      )}

      {/* The red "no schedule / rest day" banner that used to sit here is gone —
          the same information now arrives as a dialog when the employee actually
          taps Clock In, rather than as a permanent block of warning text above a
          button they could not press. */}

      {/* Break Timer */}
      {clockStep === 2 && breakEnabled && (
        <div className={`text-center rounded-2xl px-4 py-3 mx-auto max-w-xs ${isOverBreak ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
          {isOverBreak ? (
            <>
              <p className="text-xs font-semibold text-red-600 mb-1">OVERBREAK</p>
              <p className="text-2xl font-black text-red-600 tabular-nums">+{formatBreakTimer(overBreakSeconds)}</p>
              <p className="text-[10px] text-red-400 mt-0.5">Excess will be recorded as tardy</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-amber-700 mb-1">Break Time Remaining</p>
              <p className="text-2xl font-black text-amber-700 tabular-nums">{formatBreakTimer(breakRemainingSeconds)}</p>
              <p className="text-[10px] text-amber-500 mt-0.5">
                Elapsed: {formatBreakTimer(breakElapsedSeconds)} / Allowed: {formatBreakTimer(allowedBreakSeconds)}
              </p>
            </>
          )}
        </div>
      )}

      {/* Main Action Button */}
      <div className="flex flex-col items-center gap-3">
        {loading && !record ? (
          <div
            className="w-36 h-36 sm:w-40 sm:h-40 rounded-full text-sm font-bold flex flex-col items-center justify-center gap-2"
            style={{ background: 'rgba(46,65,86,0.12)', color: '#021e47' }}
          >
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#032b63' }} />
            Loading...
          </div>
        ) : clockStep === 0 ? (
          /* ── Clock In ── */
          <button
            onClick={handleClockIn}
            /* !scheduleReady deliberately absent: the button stays tappable so
               the employee gets an explanation dialog instead of a dead
               control with no way to find out why. */
            disabled={actionLoading || loading || geofenceActionBlocked || screenCaptureBlocked || desktopRequired}
            /* Matches the punch control on the home screen: orange gradient,
               fingerprint mark, soft glow. */
            className={`w-[132px] h-[132px] rounded-full text-white text-[11px] font-black tracking-[0.15em] flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${pulse === 'in' ? 'clock-pulse' : ''}`}
            style={{
              background: 'linear-gradient(145deg, #ff5900, #e04e00)',
              boxShadow: '0 14px 34px rgba(255,89,0,0.30)',
            }}
          >
            {/* No 'No Schedule' state here any more — the button reads as a
                normal Clock In and the dialog does the explaining. */}
            {actionLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : desktopRequired ? <Monitor className="w-7 h-7" /> : <Fingerprint className="w-7 h-7" strokeWidth={1.7} />}
            {actionLoading ? 'Processing' : desktopRequired ? 'App Required' : screenCaptureBlocked ? 'Desktop Only' : geofenceActionBlocked ? 'Outside Zone' : 'Clock In'}
          </button>
        ) : clockStep === 1 && breakEnabled ? (
          /* ── Start Break ── */
          <>
            <button
              onClick={handleBreakStart}
              disabled={actionLoading || loading || geofenceActionBlocked || desktopRequired}
              className="w-36 h-36 sm:w-40 sm:h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: '#d97706',
                boxShadow: '0 0 0 10px rgba(217,119,6,0.15), 0 10px 24px rgba(0,0,0,0.18)',
              }}
            >
              {actionLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Coffee className="w-6 h-6" />}
              {actionLoading ? 'Processing' : 'Start Break'}
            </button>
            <button
              onClick={handleClockOut}
              disabled={actionLoading || loading || geofenceActionBlocked || desktopRequired}
              className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors underline underline-offset-2"
            >
              Skip break & Clock Out
            </button>
          </>
        ) : clockStep === 1 && !breakEnabled ? (
          /* ── Clock Out (no break) ── */
          <button
            onClick={handleClockOut}
            disabled={actionLoading || loading || geofenceActionBlocked || desktopRequired}
            className={`w-36 h-36 sm:w-40 sm:h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${pulse === 'out' ? 'clock-pulse' : ''}`}
            style={{
              background: '#ef4444',
              boxShadow: '0 0 0 10px rgba(239,68,68,0.15), 0 10px 24px rgba(0,0,0,0.18)',
            }}
          >
            {actionLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : desktopRequired ? <Monitor className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
            {actionLoading ? 'Processing' : desktopRequired ? 'App Required' : geofenceActionBlocked ? 'Outside Zone' : 'Clock Out'}
          </button>
        ) : clockStep === 2 ? (
          /* ── End Break ── */
          <button
            onClick={handleBreakEnd}
            disabled={actionLoading || loading}
            className="w-36 h-36 sm:w-40 sm:h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isOverBreak ? '#ef4444' : '#16a34a',
              boxShadow: isOverBreak
                ? '0 0 0 10px rgba(239,68,68,0.2), 0 10px 24px rgba(0,0,0,0.18)'
                : '0 0 0 10px rgba(22,163,74,0.15), 0 10px 24px rgba(0,0,0,0.18)',
            }}
          >
            {actionLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Coffee className="w-6 h-6" />}
            {actionLoading ? 'Processing' : 'End Break'}
          </button>
        ) : (
          /* ── Clock Out (step 3) ── */
          <button
            onClick={handleClockOut}
            disabled={actionLoading || loading || geofenceActionBlocked || desktopRequired}
            className={`w-36 h-36 sm:w-40 sm:h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${pulse === 'out' ? 'clock-pulse' : ''}`}
            style={{
              background: '#ef4444',
              boxShadow: '0 0 0 10px rgba(239,68,68,0.15), 0 10px 24px rgba(0,0,0,0.18)',
            }}
          >
            {actionLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : desktopRequired ? <Monitor className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
            {actionLoading ? 'Processing' : desktopRequired ? 'App Required' : geofenceActionBlocked ? 'Outside Zone' : 'Clock Out'}
          </button>
        )}
      </div>

      {/* The Clock In / Clock Out / Total Hrs tiles that used to sit here are
          gone — the home screen carries the same three figures and this page is
          reached from that card.

          The live elapsed timer stays, though: it only ever rendered inside
          that row, and it is the one figure here the home screen cannot match,
          because home is server-rendered and this ticks every second. */}
      {isClockedIn && (
        <div className="flex items-center justify-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isOnBreak ? '#f59e0b' : '#10b981' }}
          />
          <span className="text-xs font-bold text-slate-500">
            {isOnBreak ? 'On break' : 'Running'}
          </span>
          <span className="text-sm font-black tabular-nums" style={{ color: '#032b63' }}>
            {elapsedLabel}
          </span>
        </div>
      )}

      {/* Status / Holiday */}
      {record?.isHoliday && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-xs font-semibold">
            {record.holidayType === 'REGULAR' ? 'Regular Holiday - 200% pay rate' : 'Special Non-Working - 130% pay rate'}
          </p>
        </div>
      )}


      {/* Current Location Map at Bottom.

          No mb-24 on the card below. That 96px was added to clear the fixed
          bottom dock back when this map was the last element on the clock page
          — but the portal layout already pads <main> by 88px plus the
          safe-area inset for exactly that. On the home screen, where the stat
          tiles follow, it just opened a large empty gap. */}
      {(
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: '#032b63' }} />
              <p className="text-sm font-bold" style={{ color: '#032b63' }}>Current Location</p>
            </div>
            <button
              onClick={requestLocation}
              disabled={geoLoading}
              aria-label="Refresh location"
              title="Refresh location"
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'rgba(46,65,86,0.12)', color: '#032b63' }}
            >
              <RefreshCw className={`w-4 h-4 ${geoLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="px-5 pb-4">
            {geoError && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3" style={{ background: 'rgba(239,68,68,0.08)' }}>
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-600 text-xs font-medium leading-relaxed">{geoError}</p>
              </div>
            )}

            {geoLoading && !geoPos ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: '#f8fafc' }}>
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <p className="text-xs text-slate-500 font-medium">Getting current location...</p>
              </div>
            ) : geoPos ? (
              /* Address first, map on request. The map was always rendered and
                 ate most of a phone screen, pushing the punch control and
                 everything below it out of view. The address is what an
                 employee actually checks before punching; the map is only
                 needed when that address looks wrong. */
              <div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#f8fafc' }}>
                  {/* Reverse-geocoded PH addresses run long — clamp to two
                      lines so the card height stays predictable. The full text
                      stays in the title attribute. */}
                  <p
                    className="text-xs text-slate-600 leading-relaxed line-clamp-2"
                    title={geoPos.address ?? undefined}
                  >
                    {geoPos.address ?? `${geoPos.lat.toFixed(5)}, ${geoPos.lng.toFixed(5)}`}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowMap(v => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-black"
                      style={{ color: '#032b63' }}
                      aria-expanded={showMap}
                    >
                      <MapPin className="w-3 h-3" />
                      {showMap ? 'Hide map' : 'View map'}
                    </button>
                    {geoPos.accuracy > 0 && (
                      <span className="text-[11px] font-semibold text-slate-400">
                        ±{Math.round(geoPos.accuracy)}m
                      </span>
                    )}
                  </div>
                </div>

                {/* Mounted only when opened — the map is a dynamic import, so
                    leaving it closed also avoids loading Leaflet at all. */}
                {showMap && (
                  <div className="mt-2">
                    <PortalLocationMap lat={geoPos.lat} lng={geoPos.lng} />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl px-3 py-2.5 text-xs text-slate-500" style={{ background: '#f8fafc' }}>
                Location not available yet.
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .clock-pulse {
          animation: clockPulse 320ms ease-out;
        }
        @keyframes clockPulse {
          0% { transform: scale(1); }
          45% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Full month-by-month record, moved here from the retired
          /portal/attendance page so today's punch and the history an employee
          checks it against live on one screen. */}

      {showFaceEnroll && (
        <FaceEnrollDialog
          onClose={() => setShowFaceEnroll(false)}
          onEnrolled={() => setFaceEnrolled(true)}
        />
      )}

      {pendingFaceAction && (
        <FaceVerifyDialog
          title="Verify to clock in"
          onVerified={() => {
            const run = pendingFaceAction
            setPendingFaceAction(null)
            run?.()
          }}
          onCancel={() => setPendingFaceAction(null)}
        />
      )}

      {/* Why you can't clock in — shown on tap instead of disabling the button.

          Centred at every width. This was items-end on mobile (bottom-sheet
          style), which put it behind the fixed dock. */}
      {scheduleDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setScheduleDialogOpen(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-dialog-title"
          >
            <div className="px-6 pt-7 pb-5 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: isRestDayMessage ? '#eff6ff' : '#fff7ed' }}
              >
                {isRestDayMessage
                  ? <CalendarDays className="w-7 h-7" style={{ color: '#2563eb' }} />
                  : <AlertCircle className="w-7 h-7" style={{ color: '#ea580c' }} />}
              </div>
              <h2 id="schedule-dialog-title" className="text-lg font-black" style={{ color: '#032b63' }}>
                {isRestDayMessage ? 'Today is your rest day' : 'No schedule set'}
              </h2>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                {scheduleMessage
                  ?? 'No work schedule is set for you yet, so clocking in is unavailable. Please contact your admin.'}
              </p>
              {!isRestDayMessage && (
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Your admin needs to assign you a work schedule before you can clock in.
                </p>
              )}
            </div>
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => setScheduleDialogOpen(false)}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #032b63, #1b6a6e)' }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

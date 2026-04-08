'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { startAuthentication } from '@simplewebauthn/browser'
import { format, differenceInSeconds } from 'date-fns'
import { MapPin, Clock, CheckCircle, AlertCircle, Loader2, RefreshCw, Calendar, Coffee } from 'lucide-react'
import { toast } from 'sonner'
import { PortalLocationMap } from '@/components/employee/PortalLocationMap'

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
}

interface AttendanceLog {
  id: string
  date: string
  timeIn: string | null
  timeOut: string | null
  regularHours: number | null
  lateMinutes: number | null
  isHoliday: boolean
  holidayType: string | null
}

function getGreeting(now: Date | null) {
  if (!now) return 'Hello'
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function ClockPage() {
  const [record, setRecord] = useState<TodayRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [geoPos, setGeoPos] = useState<GeoPosition | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
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
  const [employeeName, setEmployeeName] = useState('Employee')
  const [selfieRequired, setSelfieRequired] = useState(false)
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null)
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
    } catch {
      toast.error("Failed to load today's record")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/attendance/logs?limit=7')
      const data = await res.json()
      setLogs(data.records ?? [])
    } catch {
      // silent
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const loadBiometricStatus = useCallback(async () => {
    setBiometricLoading(true)
    try {
      const res = await fetch('/api/biometric/status')
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

  useEffect(() => {
    loadRecord()
    loadLogs()
    loadBiometricStatus()
    fetch('/api/employees/me')
      .then(r => r.json())
      .then(d => {
        const e = d?.employee
        if (!e) return
        const name = [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
        if (name) setEmployeeName(name)
        setSelfieRequired(!!e.workSchedule?.requireSelfieOnClockIn)
      })
      .catch(() => null)
    fetch('/api/attendance/geofence')
      .then(r => r.json())
      .then(d => setGeofence(d))
      .catch(() => null)
  }, [loadRecord, loadLogs, loadBiometricStatus])

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser')
      return null
    }
    setGeoLoading(true)
    setGeoError(null)
    const targetAccuracy = 50
    const maxWaitMs = 20000
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
        const next = { lat: latitude, lng: longitude, accuracy, address }
        setGeoPos(next)
        setGeoLoading(false)
        resolve(next)
      }

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
          if (pos.coords.accuracy <= targetAccuracy) finish(pos)
        },
        () => { /* ignore */ },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      )

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos
        },
        () => { /* ignore */ },
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
    requestLocation()
  }, [requestLocation])

  const ensureLocation = useCallback(async () => {
    if (geoPos) return geoPos
    return await requestLocation()
  }, [geoPos, requestLocation])

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

  const executeClockIn = async (pos: GeoPosition) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          address: pos.address,
          photo: selfieRequired ? (selfiePhoto ?? undefined) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Clock in failed')
      if (data.geofenceWarning) toast.warning(data.geofenceWarning)
      toast.success('Clocked in successfully!')
      setSelfiePhoto(null)
      await loadRecord()
      await loadLogs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clock in')
    } finally {
      setActionLoading(false)
    }
  }

  const executeClockOut = async (pos: GeoPosition) => {
    setActionLoading(true)
    try {
      const res = await fetch('/api/attendance/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address: pos.address }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Clock out failed')
      if (data.geofenceWarning) toast.warning(data.geofenceWarning)
      toast.success('Clocked out successfully!')
      await loadRecord()
      await loadLogs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to clock out')
    } finally {
      setActionLoading(false)
    }
  }

  const handleClockIn = async () => {
    setPulse('in')
    setTimeout(() => setPulse(null), 320)
    const pos = await ensureLocation()
    if (!pos) { toast.error('Unable to capture location'); return }
    if (!checkGeofence(pos)) {
      toast.error('You are outside the allowed clock-in area. Please move closer to the office.')
      return
    }
    if (biometricRequired && !biometricEnrolled) {
      toast.error('Please enroll your fingerprint in Profile > Portal Access before clocking in.')
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
    const pos = await ensureLocation()
    if (!pos) { toast.error('Unable to capture location'); return }
    if (!checkGeofence(pos)) {
      toast.error('You are outside the allowed clock-out area. Please move closer to the office.')
      return
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
      if (!res.ok) throw new Error(data.error ?? 'Failed to end break')
      toast.success('Break ended')
      await loadRecord()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to end break')
    } finally {
      setActionLoading(false)
    }
  }

  const isClockedIn = !!record?.timeIn && !record?.timeOut
  const isClockedOut = !!record?.timeOut
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

  // Suppress unused variable lint warning — ref kept for future use
  void pendingActionRef

  return (
    <div className="max-w-md mx-auto px-4 py-5 space-y-5">
      {/* Top Time */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-slate-500">{getGreeting(currentTime)},</p>
        <p className="text-xl font-black" style={{ color: '#227f84' }}>{employeeName}</p>
      </div>

      <div className="text-center">
        <div className="font-black tabular-nums leading-none" style={{ fontSize: '2.75rem', color: '#227f84' }}>
          {currentTime ? format(currentTime, 'HH:mm:ss') : '--:--:--'}
        </div>
        <div className="text-xs text-slate-400 font-semibold mt-1">
          {currentTime ? format(currentTime, 'MMM dd yyyy EEEE') : '--'}
        </div>
      </div>

      {/* Biometric enrollment reminder */}
      {!biometricLoading && biometricRequired && !biometricEnrolled && (
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <div>
            <p className="font-semibold text-red-600">Fingerprint setup required</p>
            <p className="text-xs text-red-500">Go to Profile {'>'} Portal Access to enroll your fingerprint before clocking in/out.</p>
          </div>
        </div>
      )}

      {selfieRequired && !isClockedIn && !isClockedOut && (
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
            style={{ background: 'rgba(34,127,132,0.12)', color: '#227f84' }}
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
          style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500" />
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

      {/* Main Action Circle */}
      <div className="flex justify-center">
        {!loading && !isClockedOut && !isClockedIn ? (
          <button
            onClick={handleClockIn}
            disabled={actionLoading || loading || geoLoading || geofenceActionBlocked}
            className={`w-40 h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${pulse === 'in' ? 'clock-pulse' : ''}`}
            style={{
              background: '#0b4a3b',
              boxShadow: '0 0 0 10px rgba(34,127,132,0.15), 0 10px 24px rgba(0,0,0,0.18)',
            }}
          >
            {actionLoading || geoLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Clock className="w-6 h-6" />}
            {actionLoading
              ? 'Processing'
              : geoLoading
                ? 'Refreshing Location'
                : geofenceActionBlocked
                  ? 'Outside Zone'
                  : 'Clock In'}
          </button>
        ) : !loading && isClockedIn ? (
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleClockOut}
              disabled={actionLoading || loading || isOnBreak || geofenceActionBlocked}
              className={`w-40 h-40 rounded-full text-white text-sm font-bold flex flex-col items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${pulse === 'out' ? 'clock-pulse' : ''}`}
              style={{
                background: '#ef4444',
                boxShadow: '0 0 0 10px rgba(250,94,1,0.15), 0 10px 24px rgba(0,0,0,0.18)',
              }}
            >
              {actionLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Clock className="w-6 h-6" />}
              {actionLoading ? 'Processing' : geofenceActionBlocked ? 'Outside Zone' : 'Clock Out'}
            </button>
            <div className="w-full max-w-xs mt-2">
              <button
                type="button"
                disabled={actionLoading || loading}
                onClick={() => (isOnBreak ? handleBreakEnd() : handleBreakStart())}
                className="w-full h-12 rounded-full relative flex items-center transition-all disabled:opacity-60 bg-white"
                style={{ boxShadow: '0 6px 18px rgba(15,23,42,0.12)' }}
              >
                <span
                  className="absolute h-9 w-9 rounded-full bg-white shadow flex items-center justify-center transition-all duration-300"
                  style={{
                    border: '2px solid #ffffff',
                    background: isOnBreak ? '#ff5c5c' : '#66bb6a',
                    left: isOnBreak ? 'calc(100% - 42px)' : '6px',
                    boxShadow: '0 6px 12px rgba(0,0,0,0.18), inset 0 2px 3px rgba(255,255,255,0.7)',
                  }}
                >
                  <Coffee className="w-5 h-5 text-white" />
                </span>
                <span
                  className="flex-1 text-[13px] font-semibold text-slate-700"
                  style={{ textAlign: isOnBreak ? 'left' : 'right', paddingLeft: '18px', paddingRight: '18px' }}
                >
                  {isOnBreak ? 'End Break' : 'Start Break'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className="w-40 h-40 rounded-full text-emerald-700 text-sm font-bold flex flex-col items-center justify-center gap-2"
            style={{ background: 'rgba(16,185,129,0.1)' }}
          >
            <CheckCircle className="w-7 h-7 text-emerald-500" />
            Done Today
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,127,132,0.12)' }}>
            <Clock className="w-5 h-5" style={{ color: '#227f84' }} />
          </div>
          <div className="text-xs font-bold text-slate-700">
            {record?.timeIn ? format(new Date(record.timeIn), 'hh:mm a') : '--'}
          </div>
          <div className="text-[10px] text-slate-400">Clock In</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,127,132,0.12)' }}>
            <Clock className="w-5 h-5" style={{ color: '#227f84' }} />
          </div>
          <div className="text-xs font-bold text-slate-700">
            {record?.timeOut ? format(new Date(record.timeOut), 'hh:mm a') : '--'}
          </div>
          <div className="text-[10px] text-slate-400">Clock Out</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(250,94,1,0.12)' }}>
            <CheckCircle className="w-5 h-5" style={{ color: '#fa5e01' }} />
          </div>
          <div className="text-xs font-bold text-slate-700">
            {isClockedIn ? elapsedLabel : `${record?.regularHours ?? 0}h`}
          </div>
          <div className="text-[10px] text-slate-400">
            {isClockedIn ? (isOnBreak ? 'On Break' : 'Running') : 'Total Hrs'}
          </div>
        </div>
      </div>

      {/* Status / Holiday */}
      {record?.isHoliday && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-700 text-xs font-semibold">
            {record.holidayType === 'REGULAR' ? 'Regular Holiday - 200% pay rate' : 'Special Non-Working - 130% pay rate'}
          </p>
        </div>
      )}

      {/* Recent Attendance Logs */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: '#227f84' }} />
            <p className="text-sm font-bold" style={{ color: '#227f84' }}>Attendance History</p>
          </div>
        </div>

        {logsLoading ? (
          <div className="px-5 pb-5 space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">No attendance logs yet.</p>
        ) : (
          <div className="px-5 pb-5 space-y-2.5">
            {logs.map((log) => {
              const inTime = log.timeIn ? format(new Date(log.timeIn), 'h:mm a') : '-'
              const outTime = log.timeOut ? format(new Date(log.timeOut), 'h:mm a') : '-'
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: '#f8fafc' }}
                >
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#227f84' }}>
                      {format(new Date(log.date), 'EEE, MMM d')}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      In {inTime} | Out {outTime}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold" style={{ color: '#227f84' }}>
                      {log.regularHours ?? 0}h
                    </p>
                    {(log.lateMinutes ?? 0) > 0 && (
                      <p className="text-[10px] font-semibold text-amber-500">{log.lateMinutes}m late</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Current Location Map at Bottom */}
      {!isClockedOut && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-24">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: '#227f84' }} />
              <p className="text-sm font-bold" style={{ color: '#227f84' }}>Current Location</p>
            </div>
            <button
              onClick={requestLocation}
              disabled={geoLoading}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'rgba(34,127,132,0.12)', color: '#227f84' }}
            >
              <RefreshCw className={`w-3 h-3 ${geoLoading ? 'animate-spin' : ''}`} />
              Refresh
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
              <div>
                <PortalLocationMap lat={geoPos.lat} lng={geoPos.lng} />
                <p className="text-xs text-slate-500 leading-relaxed rounded-xl px-3 py-2.5 line-clamp-2 mt-2"
                  style={{ background: '#f8fafc' }}>
                  {geoPos.address ?? `${geoPos.lat.toFixed(5)}, ${geoPos.lng.toFixed(5)}`}
                </p>
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
    </div>
  )
}

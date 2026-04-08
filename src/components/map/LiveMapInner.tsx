'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { format, differenceInMinutes } from 'date-fns'

// Fix default Leaflet marker icons (broken in bundlers)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function clockedInIcon(photoUrl?: string | null, initials?: string) {
  const avatar = photoUrl
    ? `<img src="${photoUrl}" alt="profile" style="width:100%;height:100%;object-fit:cover;" />`
    : `<span style="color:#0a353b;font-weight:700;font-size:10px;">${(initials ?? '').toUpperCase()}</span>`
  const content = `
    <div style="position:relative;width:40px;height:50px;">
      <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.25));">
        <path d="M20 1C10.6 1 3 8.6 3 18c0 12.7 15.3 29.3 16 30 .6.7 1.6.7 2.2 0 .7-.7 16-17.3 16-30C37 8.6 29.4 1 20 1z" fill="#fa5e01"/>
      </svg>
      <div style="position:absolute;top:6px;left:6px;width:28px;height:28px;border-radius:50%;overflow:hidden;border:2px solid white;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
        ${avatar}
      </div>
    </div>`
  return L.divIcon({
    html: content,
    className: '',
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -48],
  })
}

function clockedOutIcon(photoUrl?: string | null, initials?: string) {
  const avatar = photoUrl
    ? `<img src="${photoUrl}" alt="profile" style="width:100%;height:100%;object-fit:cover;filter:grayscale(100%);" />`
    : `<span style="color:#0a353b;font-weight:700;font-size:10px;">${(initials ?? '').toUpperCase()}</span>`
  const content = `
    <div style="position:relative;width:40px;height:50px;">
      <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.2));">
        <path d="M20 1C10.6 1 3 8.6 3 18c0 12.7 15.3 29.3 16 30 .6.7 1.6.7 2.2 0 .7-.7 16-17.3 16-30C37 8.6 29.4 1 20 1z" fill="#fa5e01"/>
      </svg>
      <div style="position:absolute;top:6px;left:6px;width:28px;height:28px;border-radius:50%;overflow:hidden;border:2px solid white;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
        ${avatar}
      </div>
    </div>`
  return L.divIcon({
    html: content,
    className: '',
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -48],
  })
}

interface EmployeeLocation {
  employeeId: string
  employee: {
    firstName: string
    lastName: string
    employeeNo: string
    photoUrl?: string | null
    department: { name: string } | null
    position: { title: string } | null
  }
  clockInTime: string | null
  clockOutTime: string | null
  clockInAddress: string | null
  clockInPhoto?: string | null
  isClockedIn: boolean
  geofenceOut?: boolean | null
  lastPing: {
    lat: number
    lng: number
    accuracy: number | null
    recordedAt: string
  } | null
}

function FitBounds({ locations }: { locations: EmployeeLocation[] }) {
  const map = useMap()
  useEffect(() => {
    const coords = locations
      .filter(l => l.lastPing)
      .map(l => [l.lastPing!.lat, l.lastPing!.lng] as [number, number])
    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], maxZoom: 15 })
    }
  }, [locations, map])
  return null
}

function formatDuration(start: string | null, end: Date = new Date()) {
  if (!start) return '—'
  const mins = Math.max(0, differenceInMinutes(end, new Date(start)))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

function offsetLatLng(lat: number, lng: number, angle: number, radiusMeters: number) {
  const dLat = (radiusMeters * Math.cos(angle)) / 111320
  const dLng = (radiusMeters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

const POSITION_BADGE_PALETTE = [
  { bg: '#ecfeff', text: '#0f766e', border: '#99f6e4' },
  { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fdba74' },
  { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
]

function getPositionBadgeStyle(title?: string | null) {
  if (!title) return null
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  }
  return POSITION_BADGE_PALETTE[hash % POSITION_BADGE_PALETTE.length]
}

export default function LiveMapInner({
  locations,
  selectedEmployeeId,
  onSelectEmployee,
}: {
  locations: EmployeeLocation[]
  selectedEmployeeId?: string | null
  onSelectEmployee?: (id: string) => void
}) {
  const defaultCenter: [number, number] = [14.5995, 120.9842] // Metro Manila
  const mapRef = useRef<L.Map | null>(null)
  const markerRefs = useRef<Record<string, L.Marker>>({})

  useEffect(() => {
    if (!selectedEmployeeId) return
    const marker = markerRefs.current[selectedEmployeeId]
    if (marker && mapRef.current) {
      const latlng = marker.getLatLng()
      mapRef.current.flyTo(latlng, Math.max(mapRef.current.getZoom(), 15), { duration: 0.6 })
      marker.openPopup()
    }
  }, [selectedEmployeeId])

  return (
    <MapContainer
      center={defaultCenter}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      ref={(instance) => {
        mapRef.current = instance
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds locations={locations} />
      {(() => {
        const groups = new Map<string, EmployeeLocation[]>()
        locations.forEach(loc => {
          if (!loc.lastPing) return
          const key = `${loc.lastPing.lat.toFixed(5)}:${loc.lastPing.lng.toFixed(5)}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(loc)
        })
        return locations.map(loc => {
        if (!loc.lastPing) return null
        const initials = `${loc.employee.firstName?.[0] ?? ''}${loc.employee.lastName?.[0] ?? ''}`
        const key = `${loc.lastPing.lat.toFixed(5)}:${loc.lastPing.lng.toFixed(5)}`
        const group = groups.get(key) ?? []
        const index = group.findIndex(g => g.employeeId === loc.employeeId)
        const total = Math.max(1, group.length)
        const ring = Math.floor(index / 8)
        const inRing = Math.min(8, total - ring * 8)
        const angle = (2 * Math.PI * (index % 8)) / Math.max(1, inRing)
        const radiusMeters = 18 + ring * 12
        const pos = total > 1 ? offsetLatLng(loc.lastPing.lat, loc.lastPing.lng, angle, radiusMeters) : loc.lastPing
        const positionTitle = loc.employee.position?.title ?? null
        const positionStyle = getPositionBadgeStyle(positionTitle)
        return (
          <Marker
            key={loc.employeeId}
            position={[pos.lat, pos.lng]}
            icon={
              loc.isClockedIn
                ? clockedInIcon(loc.employee.photoUrl, initials)
                : clockedOutIcon(loc.employee.photoUrl, initials)
            }
            zIndexOffset={loc.employeeId === selectedEmployeeId ? 1000 : 0}
            eventHandlers={{
              click: () => onSelectEmployee?.(loc.employeeId),
            }}
            ref={(m) => {
              if (m) markerRefs.current[loc.employeeId] = m
            }}
          >
            <Popup>
              <div className="text-sm min-w-[180px] font-sans">
                <div className="flex flex-col items-center text-center gap-1">
                  {loc.employee.photoUrl ? (
                    <img
                      src={loc.employee.photoUrl}
                      alt={`${loc.employee.firstName} ${loc.employee.lastName}`}
                      className="w-12 h-12 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-200 text-gray-600 text-sm font-semibold flex items-center justify-center">
                      {loc.employee.firstName[0]}{loc.employee.lastName[0]}
                    </div>
                  )}
                  <div className="min-w-0 -mt-0.5">
                    <p className="font-semibold text-gray-900 truncate">
                      {loc.employee.firstName} {loc.employee.lastName}
                    </p>
                    {positionTitle && positionStyle && (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1"
                        style={{ background: positionStyle.bg, color: positionStyle.text, borderColor: positionStyle.border }}
                      >
                        {positionTitle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-100 mt-2 pt-2 space-y-0.5">
                  <p className="text-xs">
                    <span className="text-gray-400">Status: </span>
                    <span className={loc.isClockedIn ? 'text-teal-600 font-medium' : 'text-gray-500'}>
                      {loc.isClockedIn ? '🟢 Clocked In' : '⚪ Clocked Out'}
                    </span>
                  </p>
                  {loc.geofenceOut && (
                    <p className="text-xs text-amber-600 font-medium">
                      ⚠ Outside geo-fence
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Running: {formatDuration(loc.clockInTime)}
                  </p>
                  {loc.clockInTime && (
                    <p className="text-xs text-gray-500">
                      In: {format(new Date(loc.clockInTime), 'hh:mm a')}
                    </p>
                  )}
                  {loc.clockOutTime && (
                    <p className="text-xs text-gray-500">
                      Out: {format(new Date(loc.clockOutTime), 'hh:mm a')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    Last ping: {format(new Date(loc.lastPing.recordedAt), 'hh:mm:ss a')}
                  </p>
                  {loc.lastPing.accuracy && (
                    <p className="text-xs text-gray-400">±{Math.round(loc.lastPing.accuracy)}m accuracy</p>
                  )}
                  {loc.clockInAddress && (
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                      📍 {loc.clockInAddress}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })
      })()}
    </MapContainer>
  )
}

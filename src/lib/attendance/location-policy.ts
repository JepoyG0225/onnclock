import { z } from 'zod'

export const locationPolicySchema = z.object({
  mode: z.enum(['COMPANY', 'LOCATIONS', 'FIELD']),
  locations: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    radiusMeters: z.number().int().min(1).max(100000),
  })).max(20).default([]),
}).refine(v => v.mode !== 'LOCATIONS' || v.locations.length > 0, 'Add at least one approved location')

export type LocationPolicy = z.infer<typeof locationPolicySchema>
export type EffectiveGeofence = {
  enabled: boolean; configured: boolean; requireLocation: boolean
  locations: LocationPolicy['locations']; label: string
}

export function distanceMeters(lat: number, lng: number, targetLat: number, targetLng: number) {
  const rad = (v: number) => v * Math.PI / 180
  const a = Math.sin(rad(targetLat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(targetLat)) * Math.sin(rad(targetLng - lng) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

export function geofenceStatus(policy: EffectiveGeofence, lat: number, lng: number) {
  const zones = policy.locations.map(zone => ({ ...zone, dist: distanceMeters(lat, lng, zone.lat, zone.lng) }))
  // Prefer a containing zone, otherwise show the closest boundary.
  const best = zones.find(z => z.dist <= z.radiusMeters) ?? zones.sort((a, b) => (a.dist - a.radiusMeters) - (b.dist - b.radiusMeters))[0]
  return best ? { inside: best.dist <= best.radiusMeters, dist: Math.round(best.dist), radius: best.radiusMeters, name: best.name } : null
}

export function locationError(policy: EffectiveGeofence, lat?: number, lng?: number): string | null {
  if (policy.requireLocation && (lat == null || lng == null)) return 'Location is required for this attendance schedule.'
  if (!policy.enabled) return null
  if (!policy.configured) return 'Attendance location is not configured. Contact HR.'
  if (lat == null || lng == null) return 'Location is required for clock in/out.'
  return geofenceStatus(policy, lat, lng)?.inside ? null : 'Outside the approved locations for this schedule.'
}

export function effectiveGeofence(raw: unknown, exempt: boolean, company: {
  geofenceEnabled: boolean; geofenceLat: number | null; geofenceLng: number | null; geofenceRadiusMeters: number | null
}): EffectiveGeofence {
  const parsed = locationPolicySchema.safeParse(raw)
  const policy = parsed.success ? parsed.data : { mode: 'COMPANY', locations: [] }
  if (exempt) return { enabled: false, configured: true, requireLocation: false, locations: [], label: 'Employee exemption' }
  if (policy.mode === 'FIELD') return { enabled: false, configured: true, requireLocation: true, locations: [], label: 'Field work (GPS required)' }
  const locations = policy.mode === 'LOCATIONS' ? policy.locations :
    company.geofenceLat != null && company.geofenceLng != null && (company.geofenceRadiusMeters ?? 0) > 0
      ? [{ name: 'Office', lat: company.geofenceLat, lng: company.geofenceLng, radiusMeters: company.geofenceRadiusMeters! }] : []
  const enabled = policy.mode === 'LOCATIONS' || company.geofenceEnabled
  return { enabled, configured: locations.length > 0, requireLocation: enabled, locations, label: policy.mode === 'LOCATIONS' ? 'Scheduled locations' : 'Company location' }
}

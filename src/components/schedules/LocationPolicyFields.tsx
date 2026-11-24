'use client'

import type { LocationPolicy } from '@/lib/attendance/location-policy'

export function LocationPolicyFields({ value, onChange }: { value?: LocationPolicy | null; onChange: (value: LocationPolicy) => void }) {
  const policy = value ?? { mode: 'COMPANY', locations: [] }
  return <fieldset className="space-y-3 border rounded-xl p-4">
    <legend className="text-sm font-semibold px-1">Attendance location</legend>
    <select aria-label="Attendance location rule" className="w-full border rounded-lg p-2" value={policy.mode}
      onChange={e => onChange({ ...policy, mode: e.target.value as LocationPolicy['mode'] })}>
      <option value="COMPANY">Use company geofence</option>
      <option value="LOCATIONS">Approved locations for this schedule</option>
      <option value="FIELD">Field work — any location, GPS required</option>
    </select>
    <p className="text-xs text-gray-500">Applies when this schedule is assigned to an employee or a day. Employee geofence exemptions still apply.</p>
    {policy.mode === 'LOCATIONS' && <>
      {policy.locations.map((zone, index) => <div key={index} className="grid grid-cols-2 gap-2">
        {(['name', 'lat', 'lng', 'radiusMeters'] as const).map(key => <label key={key} className="text-xs">
          {{ name: 'Location name', lat: 'Latitude', lng: 'Longitude', radiusMeters: 'Radius (meters)' }[key]}
          <input className="w-full border rounded p-2" type={key === 'name' ? 'text' : 'number'} step={key === 'radiusMeters' ? '1' : 'any'} value={zone[key]}
            onChange={e => onChange({ ...policy, locations: policy.locations.map((z, i) => i === index ? { ...z, [key]: key === 'name' ? e.target.value : Number(e.target.value) } : z) })} />
        </label>)}
        <button type="button" className="text-xs text-red-600 text-left" onClick={() => onChange({ ...policy, locations: policy.locations.filter((_, i) => i !== index) })}>Remove location</button>
      </div>)}
      <button type="button" className="text-sm underline" disabled={policy.locations.length >= 20} onClick={() => onChange({ ...policy, locations: [...policy.locations, { name: '', lat: 0, lng: 0, radiusMeters: 100 }] })}>Add approved location</button>
    </>}
  </fieldset>
}

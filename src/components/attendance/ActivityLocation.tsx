export type ActivityLocationData = { latitude?: number | null; longitude?: number | null; locationAccuracy?: number | null; locationCapturedAt?: string | null }
export function ActivityLocation({ activity }: { activity: ActivityLocationData }) {
  if (activity.latitude == null || activity.longitude == null) return <p className="mt-2 text-xs text-gray-500">Location not recorded</p>
  return <div className="mt-2 text-xs text-gray-600"><a className="inline-block min-h-8 py-1 text-blue-600 underline break-words" href={`https://www.google.com/maps?q=${activity.latitude},${activity.longitude}`} target="_blank" rel="noopener noreferrer">View location: {activity.latitude.toFixed(5)}, {activity.longitude.toFixed(5)}</a>{activity.locationAccuracy != null && <span className="block">GPS accuracy: {Math.round(activity.locationAccuracy)} m</span>}</div>
}

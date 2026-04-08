'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default Leaflet marker icons (broken in bundlers)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function activePin() {
  return L.divIcon({
    html: `<div style="background:#fa5e01;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 16)
  }, [lat, lng, map])
  return null
}

export function PortalLocationMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="portal-location-map relative z-0 w-full h-32 rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter lat={lat} lng={lng} />
        <Marker position={[lat, lng]} icon={activePin()} />
      </MapContainer>
      <style jsx global>{`
        .portal-location-map .leaflet-container {
          z-index: 0;
        }

        .portal-location-map .leaflet-pane,
        .portal-location-map .leaflet-top,
        .portal-location-map .leaflet-bottom,
        .portal-location-map .leaflet-control {
          z-index: 1 !important;
        }

        .portal-location-map .leaflet-tile-pane,
        .portal-location-map .leaflet-overlay-pane,
        .portal-location-map .leaflet-shadow-pane {
          z-index: 1 !important;
        }

        .portal-location-map .leaflet-marker-pane,
        .portal-location-map .leaflet-tooltip-pane,
        .portal-location-map .leaflet-popup-pane {
          z-index: 2 !important;
        }
      `}</style>
    </div>
  )
}

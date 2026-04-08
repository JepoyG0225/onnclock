'use client'

import dynamic from 'next/dynamic'

// SSR must be false for Leaflet (uses window/document)
const LiveMapInner = dynamic(() => import('./LiveMapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-xl">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading map...</p>
      </div>
    </div>
  ),
})

export type { default as LiveMapInnerProps } from './LiveMapInner'
export default LiveMapInner

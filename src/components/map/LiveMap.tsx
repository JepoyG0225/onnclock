'use client'

import dynamic from 'next/dynamic'
import { AppSpinner } from '@/components/ui/AppSpinner'

// SSR must be false for Leaflet (uses window/document)
const LiveMapInner = dynamic(() => import('./LiveMapInner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 rounded-xl">
      <AppSpinner message="Loading map..." />
    </div>
  ),
})

export type { default as LiveMapInnerProps } from './LiveMapInner'
export default LiveMapInner


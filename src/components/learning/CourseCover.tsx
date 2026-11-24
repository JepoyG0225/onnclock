'use client'

import { useState } from 'react'
import { BookOpen } from 'lucide-react'

export function CourseCover({ src, title }: { src?: string | null; title: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const safeSource = src && /^https?:\/\//i.test(src) ? src : null
  return <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700">
    {safeSource && failedSource !== safeSource ? (
      // Covers are hosted in the company's configured storage; allow those URLs without a fixed image-host list.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={safeSource} alt={`${title} course cover`} loading="lazy" className="h-full w-full object-cover" onError={() => setFailedSource(safeSource)} />
    ) : <div className="flex h-full items-center justify-center" aria-label={`${title}: no cover image`}><BookOpen className="h-12 w-12 text-white/80" aria-hidden="true"/><div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[24px] border-white/10"/><div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full border-[24px] border-white/10"/></div>}
  </div>
}

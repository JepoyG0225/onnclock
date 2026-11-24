'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CourseCover } from './CourseCover'

export function CourseCoverEditor({ courseId, title, src, onSaved }: { courseId: string; title: string; src: string | null; onSaved: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function save(url: string) {
    const res = await fetch(`/api/learning/courses/${courseId}/builder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thumbnailUrl: url }) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Could not save the course cover.')
    onSaved(url)
    toast.success(url ? 'Course cover updated' : 'Course cover removed')
  }
  async function upload(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || !file.size || file.size > 4 * 1024 * 1024) {
      toast.error('Choose a JPG, PNG, WebP or GIF image up to 4 MB.')
      return
    }
    setBusy(true)
    try {
      const body = new FormData(); body.append('file', file)
      const res = await fetch(`/api/learning/courses/${courseId}/builder/image`, { method: 'POST', body })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Cover upload failed. Please try a smaller image.')
      await save(data.url)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not upload cover.') }
    finally { setBusy(false) }
  }
  return <div className="flex flex-col gap-4 rounded-lg border bg-slate-50 p-4 sm:flex-row">
    <div className="w-full shrink-0 overflow-hidden rounded-lg sm:w-64"><CourseCover src={src} title={title}/></div>
    <div className="space-y-3"><div><h3 className="text-sm font-semibold">Course cover</h3><p className="mt-1 text-xs text-gray-500">Shown on course tiles for HR and employees. Use a landscape image, ideally 1280 × 720. JPG, PNG, WebP or GIF, up to 4 MB.</p></div>
      <input ref={input} aria-label="Choose course cover" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if(file) void upload(file) }}/>
      <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : src ? 'Change cover' : 'Upload cover'}</Button>{src && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await save('') } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not remove cover.') } finally { setBusy(false) } }}>Remove</Button>}</div>
    </div>
  </div>
}

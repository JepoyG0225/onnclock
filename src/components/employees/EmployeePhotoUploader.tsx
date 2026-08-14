'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function EmployeePhotoUploader({ employeeId, photoUrl, initials }: { employeeId: string; photoUrl: string | null; initials: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentPhoto, setCurrentPhoto] = useState(photoUrl)
  const [uploading, setUploading] = useState(false)

  async function upload(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')
    if (file.size > 10 * 1024 * 1024) return toast.error('Image must be 10MB or less')

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`/api/employees/${employeeId}/photo`, { method: 'POST', body: form })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to upload profile picture')
      setCurrentPhoto(`${result.photoUrl}?v=${Date.now()}`)
      toast.success('Profile picture updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload profile picture')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        className="group relative mx-auto block h-32 w-32 overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
        aria-label="Upload employee profile picture"
      >
        {currentPhoto ? (
          <img src={currentPhoto} alt="Employee profile" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-blue-100 text-3xl font-black text-blue-700">{initials}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={event => upload(event.target.files?.[0])} />
    </>
  )
}

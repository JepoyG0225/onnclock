'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type EmployeeEditField = {
  key: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea'
  options?: Array<{ label: string; value: string }>
}

export function EmployeeBlockEditor({
  employeeId,
  title,
  fields,
  values,
}: {
  employeeId: string
  title: string
  fields: EmployeeEditField[]
  values: Record<string, unknown>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(field => {
      const value = values[field.key]
      return [field.key, typeof value === 'string' || typeof value === 'number' ? String(value) : '']
    })),
  )

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = Object.fromEntries(fields.map(field => [
        field.key,
        field.type === 'number' && form[field.key] !== '' ? Number(form[field.key]) : form[field.key],
      ]))
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to update employee')
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update employee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#343434] hover:bg-[var(--brand-highlight)] hover:text-black" aria-label={`Edit ${title}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="-mx-6 -mt-6 border-b border-blue-100 bg-blue-50 px-6 py-5">
          <DialogTitle className="!text-[var(--brand-ink)]">Edit {title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {fields.map(field => (
            <div key={field.key} className={field.type === 'textarea' ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
              <Label htmlFor={`${title}-${field.key}`}>{field.label}</Label>
              {field.type === 'select' ? (
                <select
                  id={`${title}-${field.key}`}
                  value={form[field.key]}
                  onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Not set</option>
                  {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={`${title}-${field.key}`}
                  value={form[field.key]}
                  onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}
                  className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              ) : (
                <Input
                  id={`${title}-${field.key}`}
                  type={field.type ?? 'text'}
                  value={form[field.key]}
                  onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

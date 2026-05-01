'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

type TemplateItem = {
  id: string
  name: string
  category: string | null
  subject: string
  body: string
  isActive: boolean
  updatedAt: string
}

const EMPTY_FORM = {
  id: '',
  name: '',
  category: '',
  subject: '',
  body: '',
  isActive: true,
}

export default function RecruitmentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  async function loadTemplates() {
    setLoading(true)
    try {
      const res = await fetch('/api/recruitment/templates')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load templates')
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadTemplates() }, [])

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt))),
    [templates]
  )

  function startCreate() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(template: TemplateItem) {
    setForm({
      id: template.id,
      name: template.name,
      category: template.category ?? '',
      subject: template.subject,
      body: template.body,
      isActive: template.isActive,
    })
    setShowForm(true)
  }

  async function submit() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error('Name, subject, and body are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        subject: form.subject.trim(),
        body: form.body.trim(),
        isActive: form.isActive,
      }
      const res = await fetch('/api/recruitment/templates', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.id ? { ...payload, id: form.id } : payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save template')
      toast.success(form.id ? 'Template updated' : 'Template added')
      setShowForm(false)
      setForm(EMPTY_FORM)
      await loadTemplates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    const ok = window.confirm('Delete this template?')
    if (!ok) return
    try {
      const res = await fetch(`/api/recruitment/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete template')
      toast.success('Template deleted')
      await loadTemplates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete template')
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3 font-medium">
            <ArrowLeft className="w-3 h-3" /> Back to Recruitment
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Email Templates</h1>
          <p className="text-sm text-slate-500 mt-1">Create, edit, and delete recruitment email templates.</p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#2E4156]"
        >
          <Plus className="w-4 h-4" /> Add Template
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading templates...</div> : null}
        {!loading && sortedTemplates.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No templates yet. Add your first one.</div>
        ) : null}
        {!loading && sortedTemplates.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {sortedTemplates.map(template => (
              <div key={template.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{template.name}</p>
                    <p className="text-xs text-slate-500 truncate">{template.category || 'General'} · {template.subject}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${template.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => startEdit(template)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(template.id)} className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap line-clamp-3">{template.body}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">{form.id ? 'Edit Template' : 'Add Template'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Template name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Category (e.g. Interview)" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} />
              </div>
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Subject" value={form.subject} onChange={e => setForm(v => ({ ...v, subject: e.target.value }))} />
              <textarea className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm resize-none" rows={8} placeholder="Email body" value={form.body} onChange={e => setForm(v => ({ ...v, body: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))} />
                Active template
              </label>
              <p className="text-xs text-slate-500 inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{jobTitle}}'}, {'{{companyName}}'}</p>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A2D42] text-white text-sm font-semibold hover:bg-[#2E4156] disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

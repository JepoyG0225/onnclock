'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'
import { Loader2 } from 'lucide-react'

export default function NewPayrollRunPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [payDateDelayDays, setPayDateDelayDays] = useState(5)
  const [formData, setFormData] = useState({
    periodStart: '',
    periodEnd: '',
    payFrequency: 'SEMI_MONTHLY',
    payDate: '',
    notes: '',
  })

  useEffect(() => {
    let active = true
    async function loadDefaults() {
      setLoadingDefaults(true)
      try {
        const res = await fetch('/api/payroll/settings')
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !active) return
        const next = data.nextPeriod
        const settings = data.settings
        if (next && settings) {
          setPayDateDelayDays(Number(settings.defaultPayDelayDays ?? 5))
          setFormData(prev => ({
            ...prev,
            payFrequency: settings.payFrequency ?? prev.payFrequency,
            periodStart: next.periodStart ?? prev.periodStart,
            periodEnd: next.periodEnd ?? prev.periodEnd,
            payDate: next.payDate ?? prev.payDate,
          }))
        }
      } finally {
        if (active) setLoadingDefaults(false)
      }
    }
    void loadDefaults()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!formData.periodEnd) return
    const end = new Date(formData.periodEnd)
    if (Number.isNaN(end.getTime())) return
    const payDate = new Date(end)
    payDate.setDate(payDate.getDate() + payDateDelayDays)
    const nextPayDate = payDate.toISOString().slice(0, 10)
    if (formData.payDate === nextPayDate) return
    setFormData(prev => ({ ...prev, payDate: nextPayDate }))
  }, [formData.periodEnd, payDateDelayDays, formData.payDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.periodStart || !formData.periodEnd || !formData.payDate) {
      toast.error('Please fill all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to create payroll run')
        return
      }

      const { run } = await res.json()
      toast.success('Payroll run created!')
      router.push(`/payroll/${run.id}`)
    } catch {
      toast.error('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Payroll Run</h1>
        <p className="text-gray-500 mt-1">Set up the payroll period details</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payroll Period</CardTitle></CardHeader>
        <CardContent>
          {loadingDefaults && <p className="text-xs text-gray-500 mb-3">Loading payroll cycle defaults...</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start *</Label>
                <DatePicker
                  value={formData.periodStart}
                  onChange={(v) => setFormData(p => ({ ...p, periodStart: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End *</Label>
                <DatePicker
                  value={formData.periodEnd}
                  onChange={(v) => setFormData(p => ({ ...p, periodEnd: v }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pay Frequency</Label>
              <Select
                value={formData.payFrequency}
                onValueChange={v => setFormData(p => ({ ...p, payFrequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEMI_MONTHLY">Semi-Monthly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pay Date *</Label>
              <DatePicker
                value={formData.payDate}
                onChange={(v) => setFormData(p => ({ ...p, payDate: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="e.g., Includes overtime for December..."
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : 'Create Payroll Run'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

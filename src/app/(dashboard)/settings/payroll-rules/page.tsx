'use client'

import { useEffect, useState } from 'react'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { LineChart } from 'lucide-react'
import NewFeatureBadge from '@/components/ui/NewFeatureBadge'

type Rules = {
  regularOtRate: number
  restDayOtRate: number
  regularHolidayOtRate: number
  specialHolidayOtRate: number
  nightDifferentialRate: number
}

const DEFAULT_RULES: Rules = {
  regularOtRate: 1.25,
  restDayOtRate: 1.69,
  regularHolidayOtRate: 2.6,
  specialHolidayOtRate: 1.69,
  nightDifferentialRate: 0.1,
}

export default function PayrollRulesPage() {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/payroll/differential-rules')
        const data = await res.json().catch(() => ({}))
        if (!mounted || !res.ok || !data?.rules) return
        setRules({
          regularOtRate: Number(data.rules.regularOtRate ?? DEFAULT_RULES.regularOtRate),
          restDayOtRate: Number(data.rules.restDayOtRate ?? DEFAULT_RULES.restDayOtRate),
          regularHolidayOtRate: Number(data.rules.regularHolidayOtRate ?? DEFAULT_RULES.regularHolidayOtRate),
          specialHolidayOtRate: Number(data.rules.specialHolidayOtRate ?? DEFAULT_RULES.specialHolidayOtRate),
          nightDifferentialRate: Number(data.rules.nightDifferentialRate ?? DEFAULT_RULES.nightDifferentialRate),
        })
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/payroll/differential-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to save payroll differential rules')
        return
      }
      toast.success('Payroll differential rules saved')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof Rules, helper: string) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      <Input
        type="number"
        min={0}
        max={10}
        step={0.01}
        value={rules[key]}
        onChange={e => setRules(prev => ({ ...prev, [key]: Number(e.target.value || 0) }))}
      />
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  )

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50 to-white p-4 md:p-6 rounded-2xl">
      <SettingsTabs />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Shift Differential Engine</h1>
          <NewFeatureBadge releasedAt="2026-05-01T00:00:00+08:00" />
        </div>
        <p className="text-sm text-slate-500 mt-1">Configure overtime and differential multipliers used in payroll computation.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LineChart className="h-4 w-4 text-[#2E4156]" />
            Differential Rate Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-slate-500">Loading rules...</p> : null}
          {!loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Regular OT Rate', 'regularOtRate', 'Default 1.25 (125% of hourly rate)')}
              {field('Rest Day OT Rate', 'restDayOtRate', 'Default 1.69 (169% of hourly rate)')}
              {field('Regular Holiday OT Rate', 'regularHolidayOtRate', 'Default 2.60')}
              {field('Special Holiday OT Rate', 'specialHolidayOtRate', 'Default 1.69')}
              {field('Night Differential Rate', 'nightDifferentialRate', 'Default 0.10 (10% premium)')}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Rules'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

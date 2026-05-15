'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type PayrollSettings = {
  payFrequency: 'SEMI_MONTHLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
  firstCutoffStartDay: number
  firstCutoffEndDay: number
  secondCutoffStartDay: number
  secondCutoffEndDay: number
  defaultPayDelayDays: number
  enableOvertime: boolean
  disableLateDeductions: boolean
  enableNightDifferential: boolean
  nightDifferentialStart: string  // "HH:MM" 24-hour, default 22:00
  nightDifferentialEnd: string    // "HH:MM" 24-hour, default 06:00
  nightDifferentialIncludesBreak: boolean  // when true, break time inside ND window counts toward ND
  timezone: string
  payrollCurrency: string
}

const DEFAULT_SETTINGS: PayrollSettings = {
  payFrequency: 'SEMI_MONTHLY',
  firstCutoffStartDay: 1,
  firstCutoffEndDay: 15,
  secondCutoffStartDay: 16,
  secondCutoffEndDay: 31,
  defaultPayDelayDays: 5,
  enableOvertime: true,
  disableLateDeductions: false,
  enableNightDifferential: true,
  nightDifferentialStart: '22:00',
  nightDifferentialEnd: '06:00',
  nightDifferentialIncludesBreak: false,
  timezone: 'Asia/Manila',
  payrollCurrency: 'PHP',
}

export default function PayrollCycleSettingsCard() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/payroll/settings')
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !active) return
        if (data?.settings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.settings,
            ...(data.locale ?? {}),
          })
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function save() {
    setSaving(true)
    try {
      const payload = {
        ...settings,
        firstCutoffStartDay: Number(settings.firstCutoffStartDay),
        firstCutoffEndDay: Number(settings.firstCutoffEndDay),
        secondCutoffStartDay: Number(settings.secondCutoffStartDay),
        secondCutoffEndDay: Number(settings.secondCutoffEndDay),
        defaultPayDelayDays: Number(settings.defaultPayDelayDays),
        timezone: settings.timezone,
        payrollCurrency: settings.payrollCurrency.toUpperCase(),
      }
      const res = await fetch('/api/payroll/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || 'Failed to save payroll settings')
        return
      }
      const recompute = data.recompute as { processed: number; updated: number; windowStart: string; windowEnd: string } | undefined
      if (recompute && recompute.updated > 0) {
        toast.success(`Payroll settings saved · ${recompute.updated} timesheet${recompute.updated !== 1 ? 's' : ''} recomputed under the new Night Differential settings`)
      } else {
        toast.success('Payroll settings saved')
      }
      if (data.warning) toast.warning(String(data.warning))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payroll Cycle & Cutoff Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">Loading payroll settings...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Pay Frequency</Label>
                <Select
                  value={settings.payFrequency}
                  onValueChange={v => setSettings(prev => ({ ...prev, payFrequency: v as PayrollSettings['payFrequency'] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEMI_MONTHLY">Semi-Monthly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Pay Date Delay (days after period end)</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.defaultPayDelayDays}
                  onChange={e => setSettings(prev => ({ ...prev, defaultPayDelayDays: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Company Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={v => setSettings(prev => ({ ...prev, timezone: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Manila">Asia/Manila (PHT)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payroll Currency</Label>
                <Select
                  value={settings.payrollCurrency}
                  onValueChange={v => setSettings(prev => ({ ...prev, payrollCurrency: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHP">PHP - Philippine Peso</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                    <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Overtime Pay</p>
                    <p className="text-xs text-gray-500">Turn off to exclude OT hours and OT pay in payroll.</p>
                  </div>
                  <Switch
                    checked={settings.enableOvertime}
                    onCheckedChange={v => setSettings(prev => ({ ...prev, enableOvertime: v }))}
                  />
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Disable Late Deductions</p>
                    <p className="text-xs text-gray-500">
                      When ON, late minutes recorded on DTRs are NOT docked from pay.
                      Tardiness is handled separately via disciplinary records.
                    </p>
                  </div>
                  <Switch
                    checked={settings.disableLateDeductions}
                    onCheckedChange={v => setSettings(prev => ({ ...prev, disableLateDeductions: v }))}
                  />
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable Night Differential</p>
                    <p className="text-xs text-gray-500">Turn off to exclude ND hours and ND pay in payroll.</p>
                  </div>
                  <Switch
                    checked={settings.enableNightDifferential}
                    onCheckedChange={v => setSettings(prev => ({ ...prev, enableNightDifferential: v }))}
                  />
                </div>
                {settings.enableNightDifferential && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <Label className="text-xs">ND Start</Label>
                      <Input
                        type="time"
                        value={settings.nightDifferentialStart}
                        onChange={e => setSettings(prev => ({ ...prev, nightDifferentialStart: e.target.value || '22:00' }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ND End</Label>
                      <Input
                        type="time"
                        value={settings.nightDifferentialEnd}
                        onChange={e => setSettings(prev => ({ ...prev, nightDifferentialEnd: e.target.value || '06:00' }))}
                      />
                    </div>
                    <p className="col-span-2 text-[11px] text-gray-500 mt-0.5">
                      Default 22:00–06:00. Used to compute ND hours on every clock-out and payroll run.
                      Wraps midnight when end &le; start (e.g. 22:00–06:00 = 8h window).
                    </p>
                    <div className="col-span-2 mt-1 flex items-center justify-between rounded-md border bg-white p-2">
                      <div>
                        <p className="text-xs font-medium">Include break in ND</p>
                        <p className="text-[11px] text-gray-500">
                          When ON, break minutes inside the ND window also count toward ND pay (employee was on premises). Default OFF — break is deducted.
                        </p>
                      </div>
                      <Switch
                        checked={settings.nightDifferentialIncludesBreak}
                        onCheckedChange={(v) => setSettings((prev) => ({ ...prev, nightDifferentialIncludesBreak: v }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {settings.payFrequency === 'SEMI_MONTHLY' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">First Cutoff</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start Day</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={settings.firstCutoffStartDay}
                        onChange={e => setSettings(prev => ({ ...prev, firstCutoffStartDay: Number(e.target.value || 1) }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Day</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={settings.firstCutoffEndDay}
                        onChange={e => setSettings(prev => ({ ...prev, firstCutoffEndDay: Number(e.target.value || 15) }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Second Cutoff</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start Day</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={settings.secondCutoffStartDay}
                        onChange={e => setSettings(prev => ({ ...prev, secondCutoffStartDay: Number(e.target.value || 16) }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Day</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={settings.secondCutoffEndDay}
                        onChange={e => setSettings(prev => ({ ...prev, secondCutoffEndDay: Number(e.target.value || 31) }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Payroll Cycle'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
